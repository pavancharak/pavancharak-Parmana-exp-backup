# Deployment

How to run `@parmana/api` (and its Razorpay settlement poll loop) as a
container, on any Docker-based platform. Platform-agnostic by design — this
was validated with a bare `docker build` / `docker run`, not against any
specific PaaS's proprietary build system.

## Quick start

```sh
docker build -t parmana-api .

docker run -p 3000:3000 \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e PARMANA_API_KEYS='[{"callerId":"...","keyHash":"..."}]' \
  -v /path/to/keys:/app/keys:ro \
  parmana-api
```

The process fails closed on missing configuration — see below for exactly
what's required and why. `GET /health` (liveness) and `GET /ready`
(readiness — see [Health checks](#health-checks)) are both served once the
process is up.

## What's in the image

One image, two processes, started by `docker/entrypoint.sh`:

1. **The API server** (`node packages/api/dist/server.js`) — the primary
   process. Its exit, for any reason, brings the container down.
2. **The Razorpay settlement poll loop**
   (`tsx scripts/process-razorpay-settlements.ts`) — reaped independently.
   It legitimately exits `0` and stays exited when Razorpay credentials
   aren't configured for this deployment (a supported "optional, absent"
   state — see `createRazorpaySettlementProcessor.ts`); that must never
   kill a healthy, currently-serving API server. A poller crash (nonzero
   exit) is logged loudly as a warning instead — settlement confirmations
   stop processing until the container is redeployed.

**Trade-off, stated plainly:** this couples the poll loop's liveness to the
API server's (a crash in the API brings the poller down too), and
horizontally scaling the API to N replicas multiplies the poll loop to N
pollers. `RazorpaySettlementProcessor.runOnce()` is idempotent by design, so
N concurrent pollers draining the same durable event store is safe, just
wasteful. Running the poller as its own service scaled to exactly 1 replica
is the production-grade shape; that's future infrastructure work, not done
at this stage.

`docker/entrypoint.sh` forwards `SIGTERM`/`SIGINT` to both processes and
waits for them to exit before the container exits — see that file's own
comment for why the waiting logic must run in the top-level shell rather
than a background subshell (a subshell isn't the real parent of a
previously-backgrounded PID, so `wait` on it fails immediately).

## Required configuration

Everything below is validated **eagerly, before the port is bound**
(`assertStorageConfigured`, `assertSigningKeyMaterialConfigured`,
`createCallerAuthenticator`, and friends, all called from `server.ts` before
`app.listen`). A misconfigured process never boots "successfully" and fails
later on the first real request — it exits immediately with a clear error
naming exactly what's missing.

### Signing key material (always required)

Every execution authorization, receipt, verification, and settlement
confirmation is signed. Two key pairs are required in `PARMANA_KEY_DIR`
(default `./keys`, already set in the image):

- `default.private.pem` / `default.public.pem` — the authorization-signing
  key.
- `gateway.private.pem` / `gateway.public.pem` — the Gateway's
  attestation-signing key, deliberately separate (`PARMANA_GATEWAY_KEY_ID`
  overrides the `gateway` id if you need a different one).

Neither is generated automatically. Two ways to provide them:

1. **Mount a volume or platform secret file** at `/app/keys` containing all
   four `.pem` files — the image's `keys/` starts empty on purpose (see
   `.dockerignore`; key material must never be baked into the image).
2. **`PARMANA_KEY_MATERIAL_JSON`** — for platforms with no persistent-volume
   or secret-file primitive. A JSON object,
   `{ "<keyId>": { "privateKeyPem": string, "publicKeyPem": string } }`,
   written to `PARMANA_KEY_DIR` at boot for any file that doesn't already
   exist there (a pre-mounted file always wins, never overwritten). Needs
   entries for both `default` and `gateway` keyIds.

Generate a throwaway pair locally with:

```sh
openssl genrsa -out default.private.pem 2048
openssl rsa -in default.private.pem -pubout -out default.public.pem
```

(repeat for `gateway.{private,public}.pem`.)

### Storage (`PARMANA_STORAGE`)

- `memory` (default) — no external dependency; fine for a single-instance
  deployment with no durability guarantee across restarts.
- `supabase` — requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or
  `SUPABASE_ANON_KEY`). Validated eagerly at boot, not lazily on first
  request.

Independent of `PARMANA_STORAGE`: the Razorpay webhook event store
(dedup/replay protection) and the settlement poll loop's event store are
**always** Supabase-backed in production — never falls back to in-memory,
because a durable event store is required to correctly recognize a retried
webhook delivery across process restarts. If Razorpay isn't configured at
all (no `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`), the webhook route is
simply never mounted and the poller exits `0` cleanly — but the moment any
Razorpay credential is present, `SUPABASE_URL`/key become required too.

### Applying the schema (Supabase)

`PARMANA_STORAGE=supabase` (and any Razorpay credential, which always
requires Supabase — see above) needs the schema in `supabase/migrations/`
actually applied to the target Supabase project. This is a manual step this
runbook previously omitted — the gap surfaced as PostgREST returning
`PGRST205` ("Could not find the table ... in the schema cache") on every
request touching an unapplied table, even though the connection itself was
fine and credentials were valid.

Two ways to apply it:

1. Supabase CLI, if linked to the project: `supabase db push`.
2. No CLI link, or a Dashboard-only workflow: run
   `scripts/apply-all-migrations.sql` (a concatenation of every file in
   `supabase/migrations/`, in chronological order, unmodified) once, in
   full, via the Supabase Dashboard's SQL Editor. Safe to re-run — every
   statement is already idempotent (`CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`, etc. — see that file's own header comment).

After applying, PostgREST's schema cache can lag behind the newly created
tables until it reloads. If `GET /ready` (or any Supabase-backed route)
still returns `PGRST205` immediately after applying migrations, force a
reload rather than waiting: Dashboard → Database → API → "Reload schema
cache", or `NOTIFY pgrst, 'reload schema';` via the SQL Editor.

### Caller authentication (`PARMANA_API_KEYS`)

A JSON array of `{ "callerId": string, "keyHash": string }` entries.
Refuses to start with no caller authentication configured. For local
development only, `PARMANA_AUTH_DISABLED=true` bypasses this (logs a loud
warning on every boot) — never set this in a real deployment.

### Policy directory (`PARMANA_POLICY_DIR`)

Already set to `./policies` in the image (the committed `policies/`
directory is baked in). Override only if a platform needs to mount a
different policy set.

### Razorpay (optional)

Unset by default — the connector, the webhook route, and the settlement
poller all detect this and degrade gracefully (connector absent from the
registry, webhook route 404s, poller exits `0`) rather than failing to
boot. To enable:

- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — enables the connector
  (`razorpay:refund-create`, etc.).
- `RAZORPAY_WEBHOOK_SECRET` — enables `POST /webhooks/razorpay`. Unset in
  production means the route is never mounted at all, mirroring how the
  connector itself is absent when its credentials are unset.
- `RAZORPAY_SETTLEMENT_POLL_INTERVAL_MS` (default `15000`) — poll interval
  for the settlement processor.

Once any Razorpay credential is set, `SUPABASE_URL`/key become required too
(see [Storage](#storage-parmana_storage) above) — the webhook/settlement
event stores have no in-memory fallback in production.

### Everything else

`PORT` (default `3000`, read dynamically for platforms — Railway, Render,
Fly — that inject it at deploy time), `LOG_LEVEL`, `CRYPTO_MODE`,
`HASH_PROVIDER`, `PRIMARY_SIGNATURE_PROVIDER`, `TRUST_PROFILE`,
`RECEIPT_VERSION`, `EXECUTION_AUTHORIZATION_TTL_SECONDS`,
`SHUTDOWN_TIMEOUT_MS` (default `10000`, see below) all have working
defaults and rarely need to be set. See `packages/shared/src/config/Config.ts`
for the authoritative list — it's the only place `process.env` is read for
application config.

## Health checks

- **`GET /health`** — pure liveness, no external dependency touched.
- **`GET /ready`** — readiness: when storage is Supabase-backed, makes one
  cheap `HEAD`-style read against `consumed_nonces` to confirm the
  connection and credentials actually work, returning `503` if not — so an
  orchestrator can tell "up but backed by dead storage" apart from
  "genuinely ready" and route around it. When storage is `memory`, there's
  no external dependency to probe, so it reports ready unconditionally.

## Graceful shutdown

On `SIGTERM`/`SIGINT`: the API server stops accepting new connections, lets
in-flight requests finish, then exits — the "drain, don't drop" shape a
PaaS orchestrator expects before it force-kills the container.
`SHUTDOWN_TIMEOUT_MS` (default `10000`) bounds how long a hung in-flight
request (e.g. a stalled downstream call to Razorpay or Supabase) can delay
shutdown before the process force-exits on its own terms. The settlement
poller shuts down independently: it stops scheduling new ticks immediately
and waits for whichever tick is currently in flight (a courtesy, not a
correctness requirement — `runOnce()` is idempotent) before exiting.

## Fly.io specifics

Validated this session against a real `parmana-api` Fly app.

- **Secrets**: `scripts/generate-fly-secrets.mjs` generates
  `PARMANA_KEY_MATERIAL_JSON`, `PARMANA_API_KEYS` (single `smoke-test`
  caller), and `RAZORPAY_WEBHOOK_SECRET` locally (never printed), leaving
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `RAZORPAY_KEY_ID` /
  `RAZORPAY_KEY_SECRET` as placeholders to fill in, then
  `fly secrets import < .flysecrets/secrets.env` (or `fly secrets set
  PARMANA_STORAGE=supabase` etc. individually) to apply. Rotating any
  secret restarts every machine to pick it up — `fly status` should show a
  recent "last updated" and passing health checks before treating the new
  value as live.
- **Region**: `fly.toml` declares `primary_region = 'bom'`, but machine
  placement is Fly's choice at create time — confirm actual placement with
  `fly status` rather than assuming the configured primary region; this
  deployment's machines run in `lhr`.
- **Webhook registration**: `POST /webhooks/razorpay` only becomes
  reachable once `RAZORPAY_WEBHOOK_SECRET` is set and the machines have
  restarted with it. Register the permanent URL
  (`https://<app>.fly.dev/webhooks/razorpay`) in the Razorpay Dashboard
  against **Test Mode** specifically if `RAZORPAY_KEY_ID`/`SECRET` are
  test-mode keys — a Live Mode registration silently receives nothing for
  test-mode activity (see CLAIMS.md 3.7 for the debugging cost this caused
  previously).
- **Smoke test**: `GET /health` and `GET /ready` should both return `200`
  post-deploy; an unauthenticated `POST /execute` should return `401` with
  a `WWW-Authenticate` header, confirming caller auth is actually wired
  rather than accidentally disabled.

## Local verification performed this session

- `docker build` succeeds from a clean checkout.
- No config at all → fails closed with a clear error, exit code `1`
  (signing key material missing).
- Storage configured, Razorpay unset → poller logs
  `razorpay_settlement_processor_unavailable` and exits `0`; API server
  continues serving unaffected.
- Full valid config → `/health` and `/ready` both return `200`; `SIGTERM`
  produces a clean two-process shutdown with no hang and no force-exit.
- `npm test` (530 passed / 35 skipped), `npm run lint`, and `npx tsc -b`
  all clean on the code shipped in this image.
