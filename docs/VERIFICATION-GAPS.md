# Verification Gaps

Version: 1.0
Status: Public
Companion to `docs/CLAIMS.md`

---

## Purpose

`CLAIMS.md` documents what this repository proves. This document is its complement: every
place a claim, a code path, or a piece of production behavior is *not* independently
verified today. The goal is to know exactly where the unproven edges are before an external
review finds them first.

Same discipline as `CLAIMS.md`: every entry cites a file, a line, or a specific test (or
names the absence of one). Severity is one of three tiers:

- **blocks-pilot** — a real correctness, security, or operational gap a pilot customer or
  their security team would reasonably block on.
- **pre-production** — real, worth closing before general availability, not urgent enough
  to block a scoped pilot.
- **cosmetic** — a documentation, naming, or observability gap with no behavioral
  consequence.

This audit was run against commit `651497a`, `npm test` reporting 345 passed, 1 skipped, 85
test files, coverage measured via `npm run coverage` (`@vitest/coverage-v8`).

---

## Environment note, load-bearing for everything below

**The `.env` in this checkout contains live Supabase credentials** (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`), and Vite's built-in env loading exposes
them to `process.env` inside every `vitest run` invocation. This means **in this specific
checkout**, every Supabase-gated integration test (see below) actually runs against a real,
live Supabase project on every `npm test` — it is not skipped here, contrary to what a
bare clone or a CI runner without this `.env` would show. Every one of those tests passed
in this pass and is folded into the "verified" counts throughout this document.

This is itself flagged as gap **G-ENV** below: nothing about the test output distinguishes
"ran against a real database" from "ran hermetically," and a fresh clone or a CI job would
silently get far less coverage without anyone noticing the difference.

---

## Gaps closed this pass

| # | Gap | Closed by | Verified |
|---|---|---|---|
| 1 | Credential isolation (issue → consume → destroy) was proven only at the library level, never through a real HTTP request | `packages/api/tests/integration/credential-isolation.integration.test.ts` (new), using `packages/api/tests/bootstrap/createInspectableExecutionSystem.ts` (new, test-only re-composition of the real gateway/execution-control/connector chain) | 3 tests: success case (credential issued + destroyed, proven by a second `consume()` throwing `"has been revoked"`), executor-failure case (same proof, plus confirms the credential is still destroyed on a downstream failure), spoofed-attestation case (proves zero sessions/credentials are ever created when the gateway attestation doesn't verify) |
| 2 | `PolicyNotFoundError` never triggered through HTTP | `packages/api/tests/unit/execute-api.test.ts`, "returns 404 when the referenced policy does not exist" | `POST /execute` with an unregistered `policy.name`/`version` → 404 |
| 3 | `DuplicateBusinessTransactionError` never triggered through HTTP (sequential case) | Same file, "returns 409 when the same businessTransactionId is submitted twice" | Two sequential `POST /execute` calls with the same ID → 200, then 409 |
| 4 | `POST /policies/validate` had zero test coverage of any kind | `packages/api/tests/unit/policies-api.test.ts` (new file) | All 4 branches: missing `policyId` (400), missing `policyVersion` (400), loadable policy (200), unknown policy (404) |
| 5 | `GET /receipt/latest/:id`'s 200 success path never exercised | `packages/api/tests/unit/receipt-get-api.test.ts`, new case | Executes a transaction, confirms the receipt route returns the same trust record hash the execution produced |
| 6 | `GET /verification/:id`'s 200 success path never exercised | `packages/api/tests/unit/verification-api.test.ts`, new case | Same pattern |
| 7 | Envelope expiry boundary (`now === expiresAt` exactly) never tested, only "clearly expired"/"clearly valid" | `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts`, "treats the exact expiresAt instant as expired" | Confirms the `<` comparison in `AuthorizationVerifier` is exclusive at the exact instant, and that one millisecond earlier is still valid |
| 8 | Session credential expiry boundary never tested at the exact instant | `packages/execution-control/tests/unit/session-credential-vault.test.ts`, two new cases | Confirms the `>=` comparison is inclusive at the exact instant, one millisecond earlier is still valid |
| 9 | `SessionCredentialVault.consume()`/`revoke()` with an unknown ID never tested | Same file, two new cases | Both throw `"Unknown session credential: <id>."` |
| 10 | Nonce store: no test simulated two concurrent `verify()` calls on the same nonce | `envelope-verifier.test.ts`, "under two concurrent verify() calls with one nonce" | `Promise.all` of two calls, exactly one succeeds — deterministic given `MemoryNonceStore.checkAndRecord()` has no `await` between check and set, not a flaky/probabilistic test |
| 11 | Session credential vault: no test simulated two concurrent `consume()` calls on the same session credential | `session-credential-vault.test.ts`, "under two concurrent consume() calls" | Same pattern, deterministic for the same reason |

18 new tests, 2 new test files, 1 new test-only helper file. Full list of files touched is
in the phase report; nothing in `packages/*/src` was modified.

## Gaps checked and found not applicable

- **Gateway session store concurrency**: `InMemoryGatewaySessionStore.consume()` is fully
  synchronous (not even `async`), so two "concurrent" calls cannot interleave in any sense
  — Node calls them one after another, unconditionally. The existing sequential
  "rejects a reused session" test already covers everything the synchronous case can prove;
  a `Promise.all` wrapper around a synchronous method would not test anything additional.

---

## Remaining gaps, by severity

### blocks-pilot

**G-1. Duplicate Business Transaction ID: real, deterministic data-loss race in
`MemoryBusinessTransactionRepository`.**
`packages/runtime/src/services/business-transaction-service.ts:36-49` — `accept()` does
`await this.repository.exists(id)` then, only if false, `await this.repository.create(...)`.
`packages/storage/src/memory/MemoryBusinessTransactionRepository.ts:14-15` — `create()`
unconditionally does `this.transactions.set(id, transaction)`, no uniqueness enforced at
the storage layer at all. Verified directly this pass (script since discarded, not added as
a permanent test per the "don't add a test for behavior that's wrong" rule): two concurrent
`accept()` calls with the same `businessTransactionId` and *different* content both succeed,
no `DuplicateBusinessTransactionError` is ever thrown by either, and the second write
silently overwrites the first. This is not probabilistic — Node's scheduling makes it
100% reproducible via `Promise.all`. **Decision required, see below.**

**G-2. No CI runs the main test suite.** `.github/workflows/` contains exactly one workflow,
`python-sdk.yml`. Nothing runs `npm test` (345 tests, including now the HTTP-level
credential-isolation proof and, in an environment with Supabase credentials present, 10
live-database integration suites) on push or pull request. The only regression gate is a
human remembering to run it locally.

**G-3. Live external credentials are used by default, unlabeled, on every local test run.**
See the environment note above. `SUPABASE_SERVICE_ROLE_KEY` sits in a gitignored `.env` and
is picked up silently by Vite's env loading; there is nothing in the test output, this
repo's README, or `packages/api/tests/helpers/supabase-availability.ts`'s own comments that
tells a new contributor their local `npm test` run is about to write real rows to a real,
live Supabase project. No test cleans up after itself (`workflow-supabase.integration.test.ts`
and its siblings write real `business_transactions` and `execution_trust_records` rows that
are never deleted).

### pre-production

**G-4. Hybrid/post-quantum signing is dead configuration in production.** `CRYPTO_MODE`,
`PRIMARY_SIGNATURE_PROVIDER`, and `SECONDARY_SIGNATURE_PROVIDER` are all read into
`config.crypto` (`packages/shared/src/config/Config.ts:263-291`), and `crypto.mode` is
parsed but **never read anywhere else in the codebase** (confirmed by grep). Every
production signing call site hardcodes `CryptoBootstrap.create()` (single-provider), never
`createHybrid()`: `packages/runtime/src/RuntimeAuthorizationSigner.ts:25`,
`packages/runtime/src/ExecutionTrustRecordBuilder.ts:81`,
`packages/api/src/bootstrap/createConnectorRegistry.ts:43`. Both `.env` and
`packages/api/.env` in this checkout set `CRYPTO_MODE=hybrid` and
`SECONDARY_SIGNATURE_PROVIDER=dilithium3` — a deployer who sets these expecting
defense-in-depth PQ signing gets silently ignored config; the server always signs Ed25519
only. Confirmed empirically: `receipt-signature.integration.test.ts`'s captured receipt
reports `algorithm: 'ed25519'` regardless. **Decision required, see below.**

**G-5. `OverrideService` has zero test coverage and no HTTP route.**
`packages/runtime/src/services/override-service.ts` (business rules: transaction must
exist, trust record must exist, one override per transaction) is never imported by any test
anywhere in the repo, and `packages/api/src/app.ts` mounts no `/overrides` route at all. The
only proof that an override can land on a trust record and still verify
(`packages/api/tests/integration/workflow-supabase.integration.test.ts:122-200`) bypasses
`OverrideService` entirely, calling `storage.trustRecords.appendOverride()` directly on the
repository and manually pre-computing the hash/signature to match — a storage-layer proof,
not a proof that the actual application-layer service (with its business rules) works, or
is even reachable by anything. **Decision required, see below.**

**G-6. `packages/receipt` has zero test files.** `"test": "vitest run --passWithNoTests"`
means this silently succeeds with nothing asserted. Its `ExecutionReceiptBuilder`,
`ExecutionReceiptVerifier`, and the separate `ExecutionPermit` model it depends on
(`packages/execution-control`) are exercised only by `examples/tutorials/53` through `56`,
which are not part of `npm test`. Lower severity than it might look: this whole path is
already documented (`reference/receipt.mdx`) as disconnected from `packages/runtime` and
`packages/api`, so its untested state doesn't put anything on the live request path at risk
— but it is real, shipped code with a public export surface and zero automated proof of
correctness.

**G-7. `execution-failure.integration.test.ts` is permanently `describe.skip`ped**, not
env-gated. `RuntimeFactory` always constructs its own `DefaultExecutionSystem` internally,
with no dependency-injection seam for a test to supply a failing `ExecutionSystem`. The
claim it would prove — that an execution-system failure is surfaced as
`execution.status === "FAILED"` with a 500, not silently swallowed — remains unverified.
Unlike every other gap in this document, closing this one requires a `RuntimeFactory`
constructor signature change, which is out of scope for a test-only pass.

**G-8. Several error branches remain untested, all reachable only via direct library use,
not via any HTTP path this server currently exposes:**
- `ExecutionGateway.ts:246-249` — the "executionControl is incomplete" guard. Only reachable
  by direct library misuse; production's bootstrap always supplies a complete options object.
- `SignedTokenConnectorAuthenticator`'s two distinct identity-mismatch branches
  (`gatewayId` mismatch at line 65-67, `publicIdentity` mismatch, separately from the
  signature-verification branch that every existing test actually exercises first) —
  every existing test uses one consistent identity, so these specific branches, distinct
  from "signature doesn't verify," are unexercised.
- `SdkConnectorExecutor.ts:47-60` — `expectedVersion` mismatch and `health.status ===
  "unavailable"` rejections. Neither is used by `packages/api`'s bootstrap today
  (`createConnectorRegistry.ts` never passes `expectedVersion`), so also unreachable from
  HTTP currently, only from direct library use.
- `SdkConnectorExecutor.ts:62-67`'s own capability check is structurally dead in every
  configuration this repo wires up: `DefaultConnectorPolicy.assertAllowed()` runs the
  identical check earlier in the same call chain and always wins first.

**G-9. `ExecutionControlService` and `SessionCredentialSecureConnector` each independently
audit-log the same execution** (confirmed directly this pass while writing the new
credential-isolation test — see "Gaps closed" #1 above). Not a security defect: both
records are consistent, and only the connector-level one carries `credentialId`. It is a
duplicate-logging quirk worth a one-line fix (skip the outer log, or document why both
exist) but was out of scope for this pass since it isn't test-only.

### cosmetic

**G-10. CLAIMS.md citations that are vague or indirect** rather than pointing at a specific
test:
- **2.7 Replay Support** cites only "Replay package" and "G-08" — no test file named, even
  though `packages/replay/tests/unit/replay-engine.test.ts` and
  `packages/replay/tests/replay.integration.test.ts` (6 files, 9 tests total) are real and
  always-run.
- **2.9 Independent Envelope Verification** cites `packages/envelope-verifier/README.md`
  ("Claims" section) — a documentation file, not a test.
- **3.2 Fleet-Wide Single-Use** cites the same README pattern.
- **2.1, 2.2, 2.3, 2.4** cite class names only (`BusinessTransactionValidator`,
  `PolicyRouter`, `PolicyValidator`) with no test file named — and, checked directly this
  pass, **`BusinessTransactionValidator` and `PolicyRouter` have no dedicated test file
  anywhere in the repo**, only indirect coverage through other tests
  (`ReferencePolicies.test.ts`, `ReferencePoliciesEvaluation.test.ts` for
  `PolicyValidator`; nothing dedicated for the other two).

None of these claims are false — the underlying capability is real, verified by tests
elsewhere in the suite — but a reader following CLAIMS.md's own citation cannot find the
proof without independently searching for it, which is the exact failure mode CLAIMS.md's
discipline exists to prevent.

**G-11. `EXECUTION_AUTHORIZATION_TTL_SECONDS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY`, `CRYPTO_MODE`, `RECEIPT_VERSION`, and `DATABASE_URL` are read by
`packages/shared/src/config/Config.ts` but documented nowhere** on the public docs site
(`guides/deploy-patterns.mdx`, `deployment/local.mdx`, `cryptography/overview.mdx`). Of
these, `CRYPTO_MODE` is additionally dead (see G-4), so documenting it accurately means
documenting that it does nothing yet.

---

## Decision required (options, not fixes)

### D-1. Duplicate Business Transaction race (G-1)

**Option A — fix the race.** Add a real uniqueness guard to
`MemoryBusinessTransactionRepository.create()` (e.g. `Map.has` check inside the same
synchronous tick as `Map.set`, throwing `DuplicateBusinessTransactionError` itself instead
of relying on the service-layer check) and add an explicit "insert if absent" contract to
the `BusinessTransactionRepository` interface so `SupabaseBusinessTransactionRepository`
can be reviewed against the same contract (its own version is protected today only by the
Postgres `PRIMARY KEY` constraint, which would currently surface as a raw, unstructured
Postgres error rather than the clean 409 the sequential path gives, a related but distinct
inconsistency worth fixing in the same pass). *Estimated size: small, a few hours,
`MemoryBusinessTransactionRepository.create()` is nine lines; the Supabase-side error
mapping needs a `catch` for the Postgres unique-violation error code and a rethrow as
`DuplicateBusinessTransactionError`. Test: the exact `Promise.all` scenario already used
to confirm the bug, now asserting one success and one clean rejection.*

**Option B — document the limitation.** State plainly on `reference/storage.mdx` and
`guides/deploy-patterns.mdx` that `memory` storage is not safe under concurrent duplicate
submissions of the same `businessTransactionId` and is not intended for anything beyond
local development, matching its existing framing everywhere else on the site. *Estimated
size: trivial, a docs paragraph, no code change. Leaves the underlying bug in place for
anyone who does run `memory` storage under real concurrent load, including any pilot that
starts on `memory` before migrating to Supabase.*

I lean toward Option A being cheap enough that Option B alone under-serves anyone actually
running a pilot on `memory` storage under load, but this is a real design/priority call.

### D-2. Hybrid/PQ dead configuration (G-4)

**Option A — wire `createHybrid()` behind the env vars.** In each of the three call sites
(`RuntimeAuthorizationSigner`, `ExecutionTrustRecordBuilder`,
`createConnectorRegistry.ts`), branch on `config.crypto.mode` (or simply on whether
`SECONDARY_SIGNATURE_PROVIDER` is set) to call `CryptoBootstrap.createHybrid()` instead of
`.create()`, and thread the resulting `SignatureBundle` through
`SignedExecutionAuthorization`/`ExecutionTrustRecord`/`Receipt` shapes, which today assume
one `Signature`, not a bundle — this is the real complexity, not the `CryptoBootstrap` call
itself. **Tests that would prove it end to end**: an HTTP-level test asserting
`POST /execute`'s response `signature` (or a new `signatures` field) contains both an
Ed25519 and an ML-DSA-65 signature when `SECONDARY_SIGNATURE_PROVIDER=dilithium3` is set,
and that a receipt/verification still round-trips. *Estimated size: medium-to-large, this
touches the `ExecutionTrustRecord`/`Signature` domain shape (a breaking or additive schema
change, needs its own design decision), the Supabase schema (`signature_json` column
currently assumes one signature), and CLAIMS.md 2.14/2.8 (which would need updating to
claim hybrid-in-production, not just hybrid-as-a-library-capability). Not a same-day change.*

**Option B — remove the dead config, document as single-provider by design.** Delete
`CRYPTO_MODE` from both `.env` files (and stop reading it in `Config.ts`, a one-line
removal), keep `PRIMARY_SIGNATURE_PROVIDER`/`SECONDARY_SIGNATURE_PROVIDER` as they are today
(real, and already correctly documented as driving `createHybrid()` at the *library* level
for tutorials 50-52), and add one sentence to `cryptography/overview.mdx` and
`guides/choose-a-signature-provider.mdx`: the running server signs with exactly one
algorithm at a time; hybrid signing is available as a library capability, not wired into
`packages/api` today. *Estimated size: trivial, one config line removed, two doc
sentences added. Touches CLAIMS.md not at all (no existing claim says hybrid runs in the
server) and `reference/execution-system.mdx`/`reference/api.mdx` get a one-line cross-link.*

Option B is the lower-risk, immediately-actionable one; Option A is the right long-term
answer if hybrid-in-production is actually on the roadmap, but it's a schema-design
question, not a config-wiring one, and shouldn't be scoped as "just call createHybrid()."

### D-3. `OverrideService` unreachable and untested (G-5)

**Option A — wire it in.** Add a `POST /overrides` (or similar) route calling
`OverrideService`, and a test suite proving its actual business rules (duplicate-override
rejection, missing-transaction/missing-trust-record errors), replacing the storage-layer
bypass test with a real one. *Estimated size: small-to-medium, the service already exists
and is presumably complete; this is mostly route wiring plus tests, roughly a day.*

**Option B — remove it, or explicitly mark it `[FUTURE]`.** If overrides aren't meant to be
externally triggerable yet, delete the unused service (it's dead code by the same
definition applied elsewhere in this audit) or add a CLAIMS.md `[FUTURE]` entry and a
`reference/runtime.mdx` note that override application is a domain concept modeled in code
but not yet exposed. *Estimated size: trivial either way.*

---

## Top 5 to close first, if a bank's security team were reviewing next week

1. **G-1, duplicate-transaction race** (Option A above) — a real, proven data-loss bug,
   cheap to fix. *Half a day including the Supabase-side error mapping.*
2. **G-3, live credentials used silently by default** — at minimum, add a loud warning to
   `packages/api/tests/helpers/supabase-availability.ts` and this repo's contributor docs,
   and a cleanup step (or a dedicated, clearly-disposable test project) so `npm test` stops
   writing permanent rows to a real database. *A day, mostly cleanup-hook work across 10
   test files.*
3. **G-2, no CI** — a single GitHub Actions workflow running `npm test` on every PR would
   have caught nothing new this pass (everything is green), but its absence is the reason
   this whole audit was necessary instead of a standing guarantee. *A day, including
   deciding whether Supabase-gated tests run in CI (needs project secrets) or are excluded
   there and rely on local runs, which is itself a decision worth making explicitly rather
   than by default.*
4. **G-4, hybrid/PQ dead config** (Option B first, Option A if roadmapped) — Option B alone
   closes the "config that silently does nothing" trap same-day; Option A is a real project.
   *Trivial for B, weeks for A.*
5. **G-5, OverrideService unreachable** (Option A or B, either closes the ambiguity) — right
   now it's neither a documented `[FUTURE]` capability nor a tested, reachable one, which is
   the actual gap, not the specific choice between exposing or removing it. *A day for either
   option.*

---

## How to reproduce this audit

```bash
npm test                    # baseline: 345 passed, 1 skipped
npm run coverage             # per-file coverage, v8
grep -rn "\.skip(\|\.skipIf(\|\.todo(" packages/*/tests packages/*/test --include="*.test.ts"
```

Every finding above traces to a specific `file:line` cited inline; none are inferred from
summaries or file names alone.
