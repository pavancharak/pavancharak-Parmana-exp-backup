# @parmana/api

The HTTP surface over the canonical Execution Trust runtime (`@parmana/runtime`):
`POST /execute`, `POST /verify`, `GET /verify/:id`, `POST /receipt`,
`POST /replay`, the `/transactions` and `/trust-records` read routes, and
`POST /webhooks/razorpay` (inbound Razorpay webhook receipt).

## Razorpay webhooks (`POST /webhooks/razorpay`)

Receives Razorpay webhook deliveries, verifies their signature, and durably
deduplicates them by event id. This session (M4a) stops there: a verified,
fresh event is persisted to a pending-events store and acknowledged.
Nothing reads that store back to act on a settlement/refund lifecycle
change — that is a future session (M4b, see `docs/CLAIMS.md`).

**Signature verification**: HMAC-SHA256 over the raw request body bytes
against `RAZORPAY_WEBHOOK_SECRET`, compared timing-safe
(`crypto.timingSafeEqual`) against the `X-Razorpay-Signature` header. The
raw bytes are captured route-scoped, via `express.raw()` mounted on this
router only, ahead of the app's global `express.json()` (see `app.ts`) —
never a `JSON.stringify()` of a re-parsed body, which is not guaranteed to
reproduce the original wire bytes.

**Fail-closed registration**: `RAZORPAY_WEBHOOK_SECRET` unset in
production (`NODE_ENV != test`) means the route is never mounted at all —
a request to it 404s — mirroring how the Razorpay connector itself is
simply absent from the registry when `RAZORPAY_KEY_ID`/`SECRET` are unset.
In test mode, `RAZORPAY_TEST_WEBHOOK_SECRET` overrides a built-in
placeholder secret, so hermetic tests need zero setup.

**Replay protection**: durable, consume-exactly-once, keyed on
`X-Razorpay-Event-Id`, mirroring `@parmana/envelope-verifier`'s
`NonceStore` exactly (Supabase-backed in production via
`razorpay_webhook_events`'s primary key on `event_id`; in-memory in
tests). Order is enforced in code, not just convention: the dedupe store
is never touched until after the signature has verified and the event id
header is confirmed present — a forged request can never consume a
legitimate event id (see `routes/webhooks-razorpay.ts` and
`@parmana/envelope-verifier`'s `EnvelopeVerifier` for the same
verify-before-consume reasoning applied to the Gateway's nonce).

**Response discipline**: verified + fresh → persist, audit, `200`
immediately (no downstream processing inline). Duplicate (already
consumed) → `200` (acknowledge, never reprocess), audited as a
duplicate. Bad signature, missing signature header, or missing event id
header (on an otherwise-valid signature) → `401`, audited, body never
persisted anywhere. Oversized body → `413`.

**Payload handling**: treated as untrusted input even after signature
verification. Only `event id`, `event type`, and `payment`/`refund` ids
(when extractable) ever reach an audit record — never full payload
contents, and never any card/customer field Razorpay's payload may
include.

### Settlement processing (`npm run process:razorpay-settlements`)

Out-of-band from the webhook request cycle (M4a's `200` has already
returned): `RazorpaySettlementProcessor` drains the pending-events store,
correlates each `refund.processed`/`refund.failed` event to its Execution
Trust Record (parking with bounded retry if the record hasn't been
written yet), fetch-verifies the refund's real status directly from
Razorpay (never trusting the webhook's own claimed status), and appends a
second, independently signed Settlement Confirmation — the original
Receipt is never mutated. See `docs/CLAIMS.md` 3.6 for the full claim.

Run once with `processor.runOnce()` (what the test suite calls
directly), or continuously via `npm run process:razorpay-settlements` — a
thin poll loop (`scripts/process-razorpay-settlements.ts`), polling every
`RAZORPAY_SETTLEMENT_POLL_INTERVAL_MS` (default 15000). No new queue
infrastructure: `runOnce()` is itself idempotent, so overlapping or
retried ticks are always safe.

Settlement status surfaces on `GET /verification/{businessTransactionId}`
(a `settlement` field alongside the verification result — present once at
least one confirmation exists) and on `GET /trust-records/{id}` (the full
`settlementConfirmations` array) — never silently.

## Running the test suite

Most of this package's tests are hermetic and require no environment setup.

### Supabase-backed integration tests

A subset of integration tests exercise the real Supabase-backed storage
provider (`SupabaseStorageProvider`) against a live Supabase project, rather
than the in-memory provider. These tests cannot run from a bare clone with no
credentials, and are skipped automatically — with a logged reason — when the
required environment variables are absent:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`)

Setting these alone is not enough to run these tests: since the G-3 fix
(docs/VERIFICATION-GAPS.md), a suite that detects `SUPABASE_*` configured
without `ALLOW_LIVE_SUPABASE=1` also set does not run against the live
project — it skips cleanly instead, logging why. (Earlier, this was a hard
failure instead of a skip; G-15 changed that so a default `npm test` on a
machine with live credentials configured — the common daily-development
case — stays green without anyone needing to touch `.env`. Explicitly
requesting a live run with `ALLOW_LIVE_SUPABASE=1` but no visible
credentials is still a hard failure, not a skip — see G-14.) Set both
`SUPABASE_*` and `ALLOW_LIVE_SUPABASE=1` to actually run these tests:

- `tests/unit/transactions-api.test.ts` (persistence cases only — most of
  this file is hermetic)
- `tests/integration/verification-negative.integration.test.ts`
- `tests/integration/trust-record-get.integration.test.ts`
- `tests/integration/trust-record-lifecycle.integration.test.ts`
- `tests/integration/workflow-negative.integration.test.ts`
- `tests/integration/workflow-supabase.integration.test.ts`
- `tests/integration/receipt-negative.integration.test.ts`
- `tests/integration/receipt-signature.integration.test.ts`
- `tests/integration/replay.integration.test.ts`
- `tests/integration/supabase-caller-audit-sink.integration.test.ts` (added
  when the durable `SupabaseCallerAuditSink` closed G-13)

The skip check lives in `tests/helpers/supabase-availability.ts`.

The sibling `@parmana/storage` package has its own Supabase-gated suites,
routed through the same `resolveSupabaseGate` mechanism (its own copy of the
helper, kept independent by design — see that file's comment) and the same
`ALLOW_LIVE_SUPABASE=1` requirement:
`packages/storage/tests/integration/supabase-execution-trust-record-ordering.integration.test.ts`,
`supabase-nonce-store.integration.test.ts` (G-13), and
`supabase-business-transaction-duplicate.integration.test.ts` (G-1).

### Razorpay live test-mode integration test

`tests/integration/razorpay-live.integration.test.ts` drives the Razorpay
connector through a real `POST /execute` against Razorpay's real test-mode
API (`https://api.razorpay.com`) — the only test in this codebase that makes
a network call to an actual Razorpay endpoint, as opposed to
`MockRazorpayServer` (used by every other Razorpay test, including
`tests/integration/razorpay-refund.integration.test.ts`). It cannot run from
a bare clone with no credentials, and is skipped automatically — with a
logged reason — when the required environment variables are absent:

- `RAZORPAY_TEST_KEY_ID` (must start with `rzp_test_`; the suite aborts hard,
  before any network call, if it does not — see below)
- `RAZORPAY_TEST_KEY_SECRET`

Setting these alone is not enough to run this test: mirroring
`ALLOW_LIVE_SUPABASE`, a suite that detects the `RAZORPAY_TEST_KEY_*` pair
configured without `ALLOW_LIVE_RAZORPAY=1` also set does not run against the
live API — it skips cleanly instead, logging why. Explicitly requesting a
live run with `ALLOW_LIVE_RAZORPAY=1` but no visible credentials is a hard
failure, not a skip, for the same reason as `ALLOW_LIVE_SUPABASE`'s G-14
fix. Set both the `RAZORPAY_TEST_KEY_*` pair and `ALLOW_LIVE_RAZORPAY=1` to
actually run this test.

TEST MODE ONLY, fail-closed: independent of the opt-in above, before any
network call the suite asserts `RAZORPAY_TEST_KEY_ID` starts with
`rzp_test_` and aborts the whole suite (not a skip) if it does not — a
malformed or accidentally-live-mode key id must never quietly proceed.
Credentials are read from the environment only — directly by
`createRazorpayCredentialProvider.ts`'s `NODE_ENV=test` branch, with no
intermediate bridge variable (never inline, logged, or placed in an
assertion) — and never appear in the HTTP response bodies this test
asserts against.

A second, independent fail-closed guard lives in `RazorpayConnector`
itself (`packages/connector-sdk/src/connectors/razorpay/
RazorpayConnector.ts`): when no real test-mode credential is configured,
`createRazorpayCredentialProvider.ts` falls back to a built-in placeholder
credential so hermetic mock-server tests keep working with zero setup.
That placeholder is only ever safe against a mock server reached through
an explicit `baseUrl` override — `RazorpayConnector` refuses outright,
before any network call, if it would otherwise be sent to Razorpay's real
API. See `packages/connector-sdk/tests/unit/razorpay-connector.test.ts`
for the regression coverage (both the refusal against the real endpoint,
and that the placeholder still works normally against a mock).

The first two tests in the suite target a fixed, deliberately non-existent
payment id so no real (even test-mode) money is ever at risk:
`razorpay:payment-fetch` makes one real `GET /payments/:id`, and
`razorpay:refund-create` reaches only the pre-create idempotency-listing
`GET /payments/:id/refunds` before Razorpay rejects it for the missing
payment — the money-moving `POST /payments/:id/refund` call is never
reached. See `docs/CLAIMS.md` 3.4 for the precise scope of what this proves.

The skip check lives in `tests/helpers/razorpay-live-availability.ts`.

#### Third tier: live refund creation (money-moving)

A third, independently gated group of tests, nested inside the same file,
actually creates a real refund — the only place in this codebase that ever
does. It requires one additional environment variable, on top of everything
above:

- `TEST_RAZORPAY_CAPTURED_PAYMENT_ID` (must start with `pay_`; the suite
  aborts hard, before any network call, if it does not)

Absent, only this group of tests skips (with a logged reason) — the two
tests described above still run. This is deliberate: the base live gate and
the money-moving gate are independent tiers, so you can prove live
reachability without ever moving money, and only opt into the money-moving
proof separately.

**Why this can't be automated further:** Razorpay test-mode payments can
only be captured through client-side Checkout (card entry) — there is no
server-side API to create one. `TEST_RAZORPAY_CAPTURED_PAYMENT_ID` must
therefore be minted manually, once, and reused:

1. In the Razorpay Dashboard, switch to **Test Mode** (top-left toggle).
2. Create a Payment Link (Payment Links → New Payment Link) for a small
   fixed amount — anything comfortably larger than a few hundred paise is
   fine, since this suite only ever refunds 100 paise per run and the
   remainder needs to survive many runs (see below).
3. Open the payment link's checkout URL and pay it using a Razorpay test
   card (e.g. card number `4111 1111 1111 1111`, any future expiry, any
   CVV, OTP `1234` — see Razorpay's test-card documentation for the current
   list) so the payment reaches `captured` status.
4. Find the resulting payment's id (`pay_...`) in the Dashboard's Payments
   list (or the payment link's transaction detail) and set it as
   `TEST_RAZORPAY_CAPTURED_PAYMENT_ID`.

**Repeatability and exhaustion:** each suite run derives a fresh, unique
`businessTransactionId` for its refund-creation case from the run's own
timestamp, so every run creates a genuinely new 100-paise refund against
this payment — its refundable remainder depletes by exactly 100 paise per
run. Once the remainder is smaller than 100 paise, the create test will
start failing with Razorpay's real "refund amount exceeds remainder" error
(not a skip — a genuine live failure, correctly surfaced), and a new payment
must be captured (repeat the steps above) to continue running this suite.

### Known non-hermetic gap: policy directory

Independent of Supabase, any test that drives a real execution through this
package's `application` singleton (`src/application.ts`) needs
`PARMANA_POLICY_DIR` to point at a directory of policy definitions
(`@parmana/policy`'s `FilePolicyRepository` resolves against
`config.policy.directory`, which is `process.env.PARMANA_POLICY_DIR` with no
repo-relative fallback — see `packages/shared/src/config/Config.ts`). On a
machine without this env var set, those tests fail with a `TypeError` inside
`FilePolicyRepository.load()` rather than skipping gracefully. This is a
production-code config gap, not a test-fixture issue, and is tracked as a
follow-up rather than fixed by test-side changes.
