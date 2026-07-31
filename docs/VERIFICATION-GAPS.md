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

- **blocks-pilot**: a real correctness, security, or operational gap a pilot customer or
  their security team would reasonably block on.
- **pre-production**: real, worth closing before general availability, not urgent enough
  to block a scoped pilot.
- **cosmetic**: a documentation, naming, or observability gap with no behavioral
  consequence.

This audit was run against commit `651497a`, `npm test` reporting 345 passed, 1 skipped, 85
test files, coverage measured via `npm run coverage` (`@vitest/coverage-v8`).

---

## Environment note, load-bearing for everything below

Supabase-gated integration tests (see below) are gated on whether `SUPABASE_URL` plus
either `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY` are present in `process.env` at
test-run time (`packages/api/tests/helpers/supabase-availability.ts`). Vite's built-in env
loading exposes whatever a local `.env` file sets to `process.env` inside every `vitest run`
invocation, so whether these tests exercise a real, live Supabase project or are skipped
entirely depends silently on the environment doing the run, with no signal in the test
output either way. During this audit pass, Supabase credentials were available in the
environment, so every Supabase-gated integration test ran against a live project rather
than being skipped, and all of them passed; those results are folded into the "verified"
counts throughout this document.

This is itself flagged as gap **G-3** below: nothing about the test output distinguishes
"ran against a real database" from "ran hermetically," and a fresh clone or a CI job without
Supabase credentials configured would silently get less coverage than an environment that
has them, without anyone noticing the difference.

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
| 10 | Nonce store: no test simulated two concurrent `verify()` calls on the same nonce | `envelope-verifier.test.ts`, "under two concurrent verify() calls with one nonce" | `Promise.all` of two calls, exactly one succeeds, deterministic given `MemoryNonceStore.checkAndRecord()` has no `await` between check and set, not a flaky/probabilistic test |
| 11 | Session credential vault: no test simulated two concurrent `consume()` calls on the same session credential | `session-credential-vault.test.ts`, "under two concurrent consume() calls" | Same pattern, deterministic for the same reason |

18 new tests, 2 new test files, 1 new test-only helper file. Full list of files touched is
in the phase report; nothing in `packages/*/src` was modified.

---

## Gaps closed in the 2026-07-17 audit closeout session

Scope: nine tasks closing findings from the July 16 external audit. Full closing report is
this session's final message to the user; summarized here for the trust-artifact record.

| # | Gap | Closed by | Verified |
|---|---|---|---|
| 12 | `.gitignore` was mixed UTF-16LE/ASCII; git could not parse part of it, which is how `trace.txt` got committed | Rewrote `.gitignore` as clean deduplicated UTF-8/ASCII, recovering every rule from both encoded segments and adding the missing `trace.txt`/`*.trace` rules | `file .gitignore` reports ASCII text; `git check-ignore -v` passes for every representative path including a nested `trace.txt` |
| 13 | Committed debris: 1.6MB `trace.txt`, a pasted-transcript `claim.md`, stray root `resume.md`/`pending.md`, and a misplaced root `vendor-payment.json` | Deleted `trace.txt` and `claim.md`; archived `resume.md`/`pending.md` content to `docs/sessions/2026-07-11-remaining-enterprise-productization.md` and `docs/sessions/2026-07-07-milestone-1b-note.md`; moved `vendor-payment.json` to `examples/vendor-payment.json` | `git status` shows the deletions/move; no remaining references to the old paths found by repo-wide grep |
| 14 | `PARMANA_POLICY_DIR` was read via a non-null assertion; unset, it surfaced as `ERR_INVALID_ARG_TYPE` inside `FilePolicyRepository.load` at request time, not at startup | `packages/shared/src/config/Config.ts`'s `loadConfig()` now validates it at startup, same fail-closed discipline as caller-auth keys | `packages/shared/tests/unit/config.test.ts` (new, 3 tests): refuses to start when unset, refuses when blank, loads the configured value |
| 15 | No canonical list of environment variables the system reads; several were undocumented anywhere (see G-11) | Added `.env.example` at repo root, one entry per `process.env.*` read confirmed by grep across `packages/*/src`, safe placeholders only | Manually cross-checked against every `process.env.` call site in `packages/*/src` |
| 16 | `engines.node` declared `>=22` while the ML-DSA-65 (dilithium3) signature provider requires Node >=24 (native `node:crypto` support); on Node 22/23 the affected tests failed rather than skipping with an explanation | `engines.node` raised to `>=24` in the root `package.json` and the three packages that touch ml-dsa-65 (`crypto`, `execution-gateway`, `envelope-verifier`); added `isMlDsa65Supported()`/`ML_DSA_65_SKIP_REASON` (`@parmana/crypto`) and wired `describe.skipIf`/`it.skipIf` into all 5 affected test files | All 5 files pass on Node 24 (24 tests); on an unsupported Node build the same tests report skipped with the reason in the test name instead of failing |
| 17 | No CI ran the main test suite on push or pull request (`.github/workflows/` had only `python-sdk.yml`), which was gap **G-2** below | Added `.github/workflows/ci.yml`: Node 24, `npm ci`, `npm run build`, a terminology-regression grep guard, then `npm test`; explicit env vars only, no dependency on any `.env` file | YAML validated by parsing with the repo's own `yaml` dependency; the terminology-guard grep and each step verified locally against the actual repo tree |
| 18 | `createApp`'s `callerAuth` option was optional; omitting it silently mounted the API with no caller authentication, and every pre-existing test relied on that omission | `callerAuth` is now a required option: either `{ authenticator, auditSink }` or the literal string `"disabled"`. `server.ts` and all 21 dependent test files (via the shared `tests/test-app.ts` singleton, plus the two direct call sites in `credential-isolation.integration.test.ts`) now state their choice explicitly | Full `packages/api` suite: 85 passed, 1 skipped (Supabase-gated), 0 failed other than the pre-existing live-Supabase-network gap (G-3, unrelated) |
| 19 | The retired term "execution governance" remained in 14 files (`GOVERNANCE.md`, `typescript/docs/06-09`, `docs/architecture/EXECUTION-FLOW-AUDIT.md`, `docs/architecture/KEY-MANAGEMENT.md`, `docs/rfcs/RFC-0012`, `docs/00-introduction/PROBLEM.md`, `docs/specifications/reference-policies.md`, plus this document) | Replaced with "execution authorization" / "AI Execution Authorization" in 12 of the 14 (see exclusions below); added a CI grep guard so it cannot silently reappear | Repo-wide case-insensitive grep for the phrase now returns only the four intentionally-excluded files (see note below) |
| 20 | `FileKeyProvider` built key file paths from `keyId` with no input validation | Rejects any `keyId` not matching `^[A-Za-z0-9._-]+$` before path construction, in `getPrivateKey`, `getPublicKey`, `hasKey`, and `getMetadata` (all route through the same two path-building methods) | `packages/crypto/tests/unit/file-key-provider.test.ts` (new, 5 tests): rejects a `../../../../etc/passwd`-style keyId in all four methods; accepts the well-formed `"default"` keyId used by the rest of the suite |
| 21 | Root `package.json` and `typescript/package.json` both declared `"name": "parmana"`, making plain `npm run <script>` cascade across every workspace and `npx <bin>` resolve relative to an arbitrary workspace instead of the repo root (documented in `docs/audit/CORE-API-FINDINGS-SDK-AUDITS.md` §4) | Renamed `typescript/package.json` to `"@parmana/legacy-reference"`; ran `npm install` to resync `node_modules`/lockfile; removed the `./node_modules/.bin/tsx` workaround from `.github/workflows/python-sdk.yml`, restored to `npm run check:python-models` | `npm run typecheck` and `npm run check:python-models` at repo root now each run only the intended root script, verified directly |
| 22 | No LICENSE; repository intent (proprietary, evaluation-only) was undeclared | Wrote `LICENSE` (source-available for evaluation, all rights reserved, contact `founder@parmanasystems.com`); updated both `# License` sections in `README.md` to match | None |
| 23 | This document's "Environment note" asserted that the `.env` in a specific checkout contains live Supabase credentials, a disclosure of where live credentials exist, not just a description of the gating mechanism | Rephrased to describe the `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` gating mechanism and gap without asserting where live credentials are currently present | None |

**Note on item 19's two exclusions:** `docs/site/how-parmana-thinks.mdx` and
`docs/site/concepts/execution-authorization.mdx` both cite an unrelated third-party academic
work actually named "Execution Governance" (Ku, 2026, EG Reference Specification v0.9.7.3)
in a "Related work" callout. Renaming that citation would misrepresent the cited work's
real name, so it was left untouched. `docs/ROADMAP-v1.md` narrates the terminology sweep
itself (quoting the retired term to describe gap G-18 there, which this session's edit to
`docs/specifications/reference-policies.md` happens to resolve as a side effect; that
roadmap document's own G-18/R6 entries were not updated, out of scope for this session). This
document (`docs/VERIFICATION-GAPS.md`) is exempted from the CI grep guard for the same
reason this section needs to name the retired term.

**No shipped npm package name or public API identifier uses "execution governance"** in any
casing (`ExecutionGovernance`, `execution-governance`, `EXECUTION_GOVERNANCE`), confirmed by
repo-wide grep. Nothing requires a decision on that front.

**Explicitly out of scope for this session, remains open:** the in-memory `NonceStore`
(`MemoryNonceStore`) and `InMemoryCallerAuditSink` both lose all state on process restart,
taking with them the replay-nonce window and the caller-authentication audit trail alike. See new gap **G-13**
below. This was not touched this session and must not be read as closed by anything above.
*(Update from a later hardening session: G-13 has since been resolved. See its entry below
for what changed and how it's verified. This paragraph is left as written at the time for an
accurate record of what this specific session did and did not do.)*

---

## Gaps checked and found not applicable

- **Gateway session store concurrency**: `InMemoryGatewaySessionStore.consume()` is fully
  synchronous (not even `async`), so two "concurrent" calls cannot interleave in any sense:
  Node calls them one after another, unconditionally. The existing sequential
  "rejects a reused session" test already covers everything the synchronous case can prove;
  a `Promise.all` wrapper around a synchronous method would not test anything additional.

---

## Remaining gaps, by severity

**Status note, updated in the adversarial-testing hardening session that added G-24:**
every `blocks-pilot` entry (G-1, G-2, G-3, G-24) is now resolved. **This note's own prior
claim, "none describes a live, exploitable security defect," was wrong at the time it
was written**, not because anything regressed, but because G-24 was a real, live,
exploitable bypass of the core execution-authorization invariant that this document's own
internal audit process had not found; an external adversarial exercise found it. Left here
deliberately, struck through in spirit rather than silently rewritten, as the concrete
reason this document's own "re-verify before relying on it" caveat exists. Every gap still
open below (`pre-production`: G-4, G-5, G-6, G-7, G-8, G-9; `cosmetic`: G-10, G-11) is, by
its own text, either explicitly not a security defect (G-9), unreachable from any HTTP path
(G-8), disconnected from the live request path (G-6), a permanent-skip test-coverage gap
rather than a vulnerability (G-7), or a documentation/citation gap (G-10, G-11). This is
again an assessment of those entries as written, not a fresh audit pass against them, and
carries the same re-verify caveat G-24 just demonstrated the cost of skipping.

### blocks-pilot

**G-24. Policy-evaluation signals were never bound to the executed Intent: the most
severe gap found in this document, a live, reproducible bypass of the core "no
unauthorized execution" invariant, not merely an operational or data-consistency gap
like the rest of this tier. RESOLVED in the adversarial-testing hardening session that
found it.** Found via an external adversarial security exercise (not this codebase's own
internal audit process) run against a disposable local clone: `BusinessTransactionMapper.
fromRequest` (`packages/api/src/mappers/BusinessTransactionMapper.ts:34,36`) takes
`policy` and `signals` verbatim from the client request body. `SignalValidator`
(`packages/policy/src/SignalValidator.ts`) only checks that `signals` is a well-shaped
object, never that its *values* are true. `RuntimeEngine.execute`
(`packages/runtime/src/RuntimeEngine.ts`) evaluated `PolicyEngine.evaluate(policy,
signals)` against exactly those caller-declared signals, with no server-side enrichment
or derivation anywhere in the codebase (confirmed by a repo-wide grep for
enrichment/derivation patterns at the time: zero hits). Separately, `ExecutableContent`
(`packages/shared/src/domain/executable-content.ts`), the thing `ExecutionGateway`
actually signs and executes, is built from `intent.action`/`intent.target`/
`intent.parameters`, a completely disjoint set of fields from `signals`. Nothing
cross-validated that the two described the same real-world action. `docs/CLAIMS.md`
§3.4 already documented half of this precisely, neutrally, without flagging it as a
risk: "policy is evaluated against caller-supplied signals, the same generic mechanism
vendor-payment already uses"; the authors knew signals were caller-supplied; nothing in
the document connected that fact to the missing binding.

Live proof-of-concept, reproduced against an isolated disposable clone (no production
system, no real credentials, no live traffic; see that session's own isolation
confirmation) and again against this repository directly after the fix, both via `POST
/execute` with a real, valid API key and no other privilege: `signals` declared a fully
verified, policy-approved $5,000 payment to a known vendor
(`vendorVerified/invoiceVerified/paymentApproved/sufficientFunds: true, paymentAmount:
5000, riskScore: 10, vendorId: "VENDOR-1001"`), while `intent`, the part that actually
executes, targeted `"ATTACKER-CONTROLLED-ACCOUNT-9999"` for `999999999`. Before the fix:
`200`, policy decision `APPROVED`, execution `COMPLETED`, a real Ed25519-signed Execution
Trust Record and receipt issued for it: the exact artifacts this project's "independently
verifiable execution" claim rests on, attesting to something that never happened as
described. A related, compounding finding from the same session: `authority.principalId`
(who the trust record says approved the action) was likewise caller-declared with no
binding to the identity `callerId` actually proves. Any caller holding any valid API key
could claim to be any human or role, including an "impersonate the CEO" PoC that also
succeeded before this fix.

Fix, two parts, deliberately scoped to *bind the signals a policy actually evaluates to
the intent it actually executes* rather than the larger, separate problem of
independently re-verifying every signal's truth (most signals, `vendorVerified`,
`riskScore`, and similar, have no Intent-side equivalent at all; deriving *those* from an
independently verified source, the way `RazorpaySettlementProcessor` already correctly
does for webhook-derived settlement facts ("the webhook is a doorbell, not a delivery"),
is real, valuable, future work, not done this session):

- **`Policy.boundSignals`** (`packages/policy/src/types/Policy.ts`), an opt-in map from
  signal key to an intent dot-path (`{ "paymentAmount": "parameters.amount", "vendorId":
  "target" }`), validated structurally by `PolicyValidator`. **`SignalIntentBinder`**
  (`packages/policy/src/SignalIntentBinder.ts`) checks every declared binding (strict
  equality; a missing signal counts as a violation, not a pass), and `RuntimeEngine.
  execute` runs this check immediately before `PolicyEngine.evaluate`, over the exact
  signals about to be evaluated and the exact intent that will be signed and executed if
  approved. A violation is built into an ordinary `PolicyDecision` with outcome `REJECT`
  and a reason naming every mismatched field. It flows through the same `ExecutionGate.
  enforce` rejection path as any other policy rejection, so **no authorization is ever
  generated** for a mismatched request, the same fail-closed shape as every other gate in
  this document. `policies/vendor-payment/2.0.0/policy.json` and
  `policies/razorpay-refund/1.0.0/policy.json` were patched in place (not new versions:
  this is a security fix to existing behavior, the same precedent G-1's in-place atomicity
  fix set, not a new business capability) to declare `boundSignals` for their
  amount/target-shaped signals.
- **`isPrincipalAllowed`** (`packages/api/src/auth/isPrincipalAllowed.ts`): an
  authenticated caller may only submit a transaction whose `authority.principalId` is in
  its `ApiKeyEntry.allowedPrincipalIds` grant (`packages/shared/src/config/
  ApiKeyEntry.ts`), defaulting, when unset, to requiring `principalId === callerId`
  exactly, never "anything." Enforced in `routes/execute.ts` and `routes/transactions.ts`
  before `application.execute` is ever called; a mismatch is `403`, no transaction
  constructed. Composed with a second, independent fix for the compounding IDOR finding
  from the same session (any authenticated caller could read any other caller's complete
  transaction/trust-record/receipt history via `/transactions`, `/trust-records`,
  `/verify`, `/verification`, `/replay`, `/receipt*`, none of them scoped by caller at
  all): `metadata.submittedBy` is now stamped server-side from the authenticated
  `callerId` (any client-supplied value is overwritten, never trusted), and
  `isOwnedByCaller` (`packages/api/src/auth/isOwnedByCaller.ts`) gates all six read routes
  plus `GET /transactions`'s list (filtered post-fetch) and `GET /transactions/:id`.
  Cross-caller access now reads as a clean `404`, not a `403` that would confirm the
  target id exists. Both principal-binding and ownership checks are skipped only when
  caller-auth itself is disabled (`req.callerId === undefined`), matching that mode's
  existing no-caller-identity posture.

A third, unrelated finding from the same session was fixed alongside these because it was
already well-scoped: `FilePolicyRepository.load` (`packages/policy/src/
FilePolicyRepository.ts`) built its file path from `name`/`version` with no input
validation, the same bug class G-20 (this table's item 20, FileKeyProvider) had already
been hardened against, just not applied here. Live PoC: `policy: { name:
"../examples/tutorials/01-hello-world", version: "." }` produced a *different, content-
dependent* error (`400 "policyId is required."`) than the clean `404 "not found"` a
genuinely absent path returns, proof the file was read and parsed from outside
`PARMANA_POLICY_DIR`. Now rejected by the same `^[A-Za-z0-9._-]+$` allowlist
`FileKeyProvider` already uses, before any filesystem access, collapsing both cases to an
identical `404` with no differential signal. A fourth, lower-severity finding (malformed
JSON and oversized request bodies on `/execute` surfaced as a generic `500`, indistinguish-
able from a crash, even though the identical `entity.too.large` error type already had
dedicated `413` handling on the webhook route) was fixed the same way, in
`middleware/error-handler.ts`.

Verified: 28 new tests across `packages/policy` and `packages/api` (`SignalIntentBinder.
test.ts`, `file-policy-repository.test.ts`, `isPrincipalAllowed.test.ts`,
`caller-scoping.integration.test.ts`, `error-handler-body-parsing.test.ts`, plus new cases
in `runtime.e2e.test.ts` and `caller-auth.integration.test.ts`), each reproducing the
specific live exploit shape found and asserting it is now rejected, alongside positive
controls proving legitimate matching requests still succeed and cross-caller access to a
caller's *own* data is unaffected. Full suite: 597 tests (558 passed, 35 skipped, the
same pre-existing Supabase-gated skip count as before this session, nothing newly
skipped), `npm run lint` and `npm run typecheck` both clean. The exact live exploit
sequence (signal/intent mismatch, principal spoofing, path traversal, cross-caller read)
was re-run via real HTTP against a freshly built, isolated clone with the fix applied,
not only the automated suite, and confirmed blocked in every case, with a positive
control confirming a legitimate, correctly-bound request still executes successfully.

**Residual, explicitly not addressed by this session, flagged for a future pass:**
`boundSignals` only closes the *decoupling* between what a policy evaluates and what
executes for the specific fields a policy author declares bound. It does not verify that
an unbound signal (`vendorVerified`, `paymentApproved`, `sufficientFunds`, `riskScore`,
and similar) is actually *true*. Those remain caller-declared attestations with no
independent verification, same as before this session; closing that gap for real would
mean extending the `RazorpaySettlementProcessor` fetch-verify pattern to policy signals
generally, a materially larger project than this session's scope. `razorpay-refund/1.0.0`
was bound only on `requestedRefundAmountPaise`; a `paymentId`-shaped binding (so a
declared `paymentStatus: "captured"` claim cannot be about a different payment than the
one `intent` actually refunds) was considered and deliberately not added, since the
policy's `signalsSchema` has no existing field cleanly mappable to `intent.parameters.
paymentId` without inventing new policy-author-facing surface beyond this session's
scope. Flagged here rather than silently left unmentioned.

**G-1. Duplicate Business Transaction ID: real, deterministic data-loss race in
`MemoryBusinessTransactionRepository`. RESOLVED (Option A, as written in D-1 below,
implemented as written) in the audit-sink/G-1 hardening session that followed the G-13
session.** The original bug
(`packages/runtime/src/services/business-transaction-service.ts:36-49`): `accept()` does
`await this.repository.exists(id)` then, only if false, `await this.repository.create(...)`,
a classic check-then-act race, not atomic. Two concurrent `accept()` calls with the same
`businessTransactionId` and *different* content both used to succeed, no
`DuplicateBusinessTransactionError` was ever thrown by either, and the second write silently
overwrote the first (100% reproducible via `Promise.all`, not probabilistic).

The fix, exactly as D-1's Option A specified:

- **`MemoryBusinessTransactionRepository.create()`** now does the `Map.has` check and the
  `Map.set` in the same synchronous tick, no `await` between them, so two concurrent calls
  cannot interleave (the same technique `MemoryNonceStore.checkAndRecord()` and
  `SupabaseNonceStore.checkAndRecord()` already use for G-13), and throws
  `DuplicateBusinessTransactionError` itself on a collision, rather than relying on the
  service layer's separate (and racy) `exists()` check. `business-transaction-service.ts`'s
  own `exists()`-then-`create()` sequence is untouched; it remains a cheap fast-path for the
  non-racing common case, but the storage layer is now the actual source of truth.
- **`BusinessTransactionRepository`'s `create()` contract** (`packages/shared/src/
  repositories/business-transaction-repository.ts`) now documents the insert-if-absent
  requirement explicitly: every implementation must throw `DuplicateBusinessTransactionError`
  atomically for a duplicate, not overwrite it.
- **`SupabaseBusinessTransactionRepository.create()`** now maps a `23505` unique-violation
  (from the `business_transaction_id TEXT PRIMARY KEY` constraint that was already there,
  in `supabase/migrations/20260629013035_initial_schema.sql` since the original schema, no
  new migration needed) to `DuplicateBusinessTransactionError` via the same
  `isUniqueViolation` helper G-13 built (`packages/storage/src/errors/
  PostgresErrorCodes.ts`), instead of rethrowing the raw Postgres error.
- **Architectural note, not anticipated by D-1's text**: `DuplicateBusinessTransactionError`
  previously lived in `@parmana/runtime`, which `@parmana/storage` cannot depend on without a
  circular reference (`packages/runtime/tsconfig.json` already references `../storage` for
  its own test fixtures). The class was moved to `@parmana/shared`
  (`packages/shared/src/errors/duplicate-business-transaction-error.ts`, alongside the
  existing sibling `BusinessTransactionNotFoundError`/`ConflictError`/`ParmanaError`
  hierarchy that `execution-service.ts` already used) so both repositories can throw the
  identical class. `packages/runtime/src/errors/DuplicateBusinessTransactionError.ts` now
  re-exports it, so every existing import path
  (`business-transaction-service.ts`, `error-handler.ts`, `execute-api.test.ts`) is
  unchanged and `instanceof` identity is preserved end to end, verified directly by
  `execute-api.test.ts`'s existing "returns 409 when the same businessTransactionId is
  submitted twice" test, which still passes unmodified.
- **API-layer HTTP mapping required no change.** `packages/api/src/middleware/
  error-handler.ts`'s existing `instanceof DuplicateBusinessTransactionError` branch
  (409, no `code` field, matching `schemas/common/error.schema.json`'s documented contract)
  already matches the relocated class via the re-export, confirmed by the same
  `execute-api.test.ts` test above.

Verified: 8 unit tests with mocked/in-memory storage:
`packages/storage/tests/unit/memory-business-transaction-repository.test.ts` (including the
concurrency proof: two simultaneous `create()` calls with the same id and different content,
exactly one succeeds and the other rejects with `DuplicateBusinessTransactionError`, and the
stored record is exactly the winner's, never a merge or the loser's),
`packages/storage/tests/unit/supabase-business-transaction-repository.test.ts` (mocked
`23505` mapping, and fail-closed propagation of any other storage error), and
`packages/storage/tests/unit/business-transaction-repository-duplicate-consistency.test.ts`
(`describe.each` over both implementations, asserting the identical error class and message
for a duplicate), plus 2 Supabase-gated integration tests against a real project, routed
through `resolveSupabaseGate`:
`packages/storage/tests/integration/supabase-business-transaction-duplicate.integration.test.ts`
(sequential duplicate, and the same concurrent-race proof against real Postgres).

**G-2. No CI runs the main test suite. CLOSED in the 2026-07-17 session.** See "Gaps closed
in the 2026-07-17 audit closeout session" above. `.github/workflows/ci.yml` now runs
`npm ci`, `npm run build`, a terminology-regression guard, and `npm test` on every push and
pull request, Node 24, with explicit env vars and no dependency on any `.env` file.
Supabase-gated integration tests are not run in CI (no `SUPABASE_*` secrets are configured
there); they skip cleanly rather than failing, which is itself a decision worth revisiting
if fleet-wide Supabase coverage in CI is wanted later; not done this session.

**G-3. Live external credentials are used by default, unlabeled, on every local test run.
RESOLVED in this session (hardening pass following 2026-07-17 audit closeout).** All 10
Supabase-gated suites (9 in `packages/api`, 1 in `packages/storage`) now route through a
shared `resolveSupabaseGate(suiteLabel)` helper
(`packages/api/tests/helpers/supabase-availability.ts`,
`packages/storage/tests/helpers/supabase-availability.ts`, kept as two independent copies
by design; see that file's own comment). Behavior:

- No `SUPABASE_*` configured: unchanged, skips cleanly, exactly as before.
- `SUPABASE_*` configured but `ALLOW_LIVE_SUPABASE=1` is not set: **hard failure**, not a
  silent run and not a silent skip. The suite throws during test collection, naming the
  missing flag explicitly, so a contributor whose `.env` happens to carry live credentials
  can no longer write real rows to a real project without knowing it.
- `SUPABASE_*` configured and `ALLOW_LIVE_SUPABASE=1` set: runs exactly as it did before
  this change.

Verified directly: with this checkout's own live-credential `.env` present and
`ALLOW_LIVE_SUPABASE` unset, `receipt-negative.integration.test.ts` now fails in ~3s with
`"Receipt Negative Integration: SUPABASE_URL and a Supabase key are configured, but
ALLOW_LIVE_SUPABASE=1 is not set..."` instead of silently running. The guard itself (all
three branches) is covered by unit tests with no live network dependency:
`packages/api/tests/unit/supabase-availability.test.ts` and
`packages/storage/tests/unit/supabase-availability.test.ts` (4 and 3 tests respectively).

**Residual, not addressed by this fix:** once a contributor does opt in with
`ALLOW_LIVE_SUPABASE=1`, no test cleans up after itself:
`workflow-supabase.integration.test.ts` and its siblings still write real
`business_transactions` and `execution_trust_records` rows that are never deleted. That
cleanup gap is a smaller, separate concern from the "silent by default" problem this fix
closes, and was out of this session's scope.

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
`SECONDARY_SIGNATURE_PROVIDER=dilithium3`. A deployer who sets these expecting
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
repository and manually pre-computing the hash/signature to match: a storage-layer proof,
not a proof that the actual application-layer service (with its business rules) works, or
is even reachable by anything. **Decision required, see below.**

**G-6. `packages/receipt` has zero test files.** `"test": "vitest run --passWithNoTests"`
means this silently succeeds with nothing asserted. Its `ExecutionReceiptBuilder`,
`ExecutionReceiptVerifier`, and the separate `ExecutionPermit` model it depends on
(`packages/execution-control`) are exercised only by `examples/tutorials/53` through `56`,
which are not part of `npm test`. Lower severity than it might look: this whole path is
already documented (`reference/receipt.mdx`) as disconnected from `packages/runtime` and
`packages/api`, so its untested state doesn't put anything on the live request path at risk.
It is, however, real, shipped code with a public export surface and zero automated proof of
correctness.

**G-7. `execution-failure.integration.test.ts` is permanently `describe.skip`ped**, not
env-gated. `RuntimeFactory` always constructs its own `DefaultExecutionSystem` internally,
with no dependency-injection seam for a test to supply a failing `ExecutionSystem`. The
claim it would prove (that an execution-system failure is surfaced as
`execution.status === "FAILED"` with a 500, not silently swallowed) remains unverified.
Unlike every other gap in this document, closing this one requires a `RuntimeFactory`
constructor signature change, which is out of scope for a test-only pass.

**G-8. Several error branches remain untested, all reachable only via direct library use,
not via any HTTP path this server currently exposes:**
- `ExecutionGateway.ts:246-249`: the "executionControl is incomplete" guard. Only reachable
  by direct library misuse; production's bootstrap always supplies a complete options object.
- `SignedTokenConnectorAuthenticator`'s two distinct identity-mismatch branches
  (`gatewayId` mismatch at line 65-67, `publicIdentity` mismatch, separately from the
  signature-verification branch that every existing test actually exercises first);
  every existing test uses one consistent identity, so these specific branches, distinct
  from "signature doesn't verify," are unexercised.
- `SdkConnectorExecutor.ts:47-60`: `expectedVersion` mismatch and `health.status ===
  "unavailable"` rejections. Neither is used by `packages/api`'s bootstrap today
  (`createConnectorRegistry.ts` never passes `expectedVersion`), so also unreachable from
  HTTP currently, only from direct library use.
- `SdkConnectorExecutor.ts:62-67`'s own capability check is structurally dead in every
  configuration this repo wires up: `DefaultConnectorPolicy.assertAllowed()` runs the
  identical check earlier in the same call chain and always wins first.

**G-9. `ExecutionControlService` and `SessionCredentialSecureConnector` each independently
audit-log the same execution** (confirmed directly this pass while writing the new
credential-isolation test; see "Gaps closed" #1 above). Not a security defect: both
records are consistent, and only the connector-level one carries `credentialId`. It is a
duplicate-logging quirk worth a one-line fix (skip the outer log, or document why both
exist) but was out of scope for this pass since it isn't test-only.

**G-13. `MemoryNonceStore` and `InMemoryCallerAuditSink` both lose all state on process
restart. RESOLVED in the durable-replay-protection hardening session that followed the
2026-07-17 audit closeout and its own G-3 fix.** Both now have durable, Supabase-backed
replacements, wired in as the production default:

- `packages/storage/src/supabase/SupabaseNonceStore.ts`: implements `NonceStore`
  (`@parmana/envelope-verifier`) with the exact same interface and call-site semantics as
  `MemoryNonceStore`: a nonce is still consumed as the last step of verification, strictly
  before execution (`packages/execution-gateway/src/ExecutionGateway.ts`, unchanged by this
  session; only the storage backing changed). Backed by a new `consumed_nonces` table
  (`supabase/migrations/20260718090000_add_nonce_and_caller_audit_tables.sql`) whose
  `PRIMARY KEY` on `nonce` is the entire atomicity mechanism: two concurrent `INSERT`s of
  the same nonce race at the database, not in application code; exactly one succeeds, the
  other fails with a `23505` unique_violation, mapped to "already consumed" by a new
  `isUniqueViolation` helper (`packages/storage/src/errors/PostgresErrorCodes.ts`; no such
  Postgres-error-code mapping existed anywhere in this codebase before this session; see
  D-1 below, which needs the same kind of mapping for G-1, still open and unrelated).
- `packages/api/src/auth/SupabaseCallerAuditSink.ts`: implements `CallerAuditSink`
  unchanged, backed by a new `caller_audit_events` table in the same migration.

Production wiring (`packages/api/src/bootstrap/createNonceStore.ts`,
`createCallerAuditSink.ts`) fails closed: test wiring (`NODE_ENV=test`) still gets
`MemoryNonceStore`/`InMemoryCallerAuditSink`, mirroring the production/test split
`createCredentialProvider.ts` already established for the vendor-payment connector
credential, but outside test wiring, an unconfigured Supabase backing throws a named,
actionable error at startup (`assertSupabaseConfigured`) rather than silently falling back
to an in-memory store. `SupabaseNonceStore.checkAndRecord` also fails closed on any error
other than a unique-violation: the error propagates rather than being swallowed, so a
request whose nonce check hit an unreachable database is rejected, never silently treated
as accepted.

Verified: 22 unit tests against mocked storage (atomic-consumption mapping, the fail-closed
storage-error path, and the fail-closed production-wiring checks):
`packages/storage/tests/unit/supabase-nonce-store.test.ts`,
`packages/storage/tests/unit/postgres-error-codes.test.ts`,
`packages/api/tests/unit/supabase-caller-audit-sink.test.ts`,
`packages/api/tests/unit/bootstrap/create-nonce-store.test.ts`,
`packages/api/tests/unit/bootstrap/create-caller-audit-sink.test.ts`, plus 5 Supabase-gated
integration tests against a real project, routed through the same `resolveSupabaseGate` the
G-3 fix established (skip cleanly with no credentials, hard-fail without
`ALLOW_LIVE_SUPABASE=1`): `packages/storage/tests/integration/
supabase-nonce-store.integration.test.ts` (atomic consumption, a real concurrent-`INSERT`
race with exactly one winner, and, the test that actually proves this gap closed, a nonce
consumed through one store instance is still consumed by a second, independently
constructed instance against the same backing, which `MemoryNonceStore` cannot pass at all)
and `packages/api/tests/integration/supabase-caller-audit-sink.integration.test.ts` (a
written event is read back through a second, independent client).

**Residual, explicitly not addressed by this session:**
- **Unbounded growth.** `consumed_nonces` is append-only by design (no application code
  updates or deletes a row), and nothing purges expired rows yet. The table carries
  `expires_at` for exactly this purpose; a future session should add a retention job (e.g. a
  scheduled delete of rows well past their `expires_at`), sized past the maximum TTL rather
  than tied to it. `caller_audit_events` has the same open shape and the same unmade
  retention decision.
- **`CallerAuditSink.record()`'s failure semantics are unchanged, not hardened.**
  `middleware/caller-auth.ts` still `await`s `record()` with no `try`/`catch`, exactly as
  before this session (re-confirmed by re-reading the call site). This session was
  instructed to preserve that behavior, change only durability, and does. Whether a failed
  audit write should be allowed to fail the caller-auth request path at all remains an open
  design question, not decided here. *(Update from a later session: this question has since
  been decided and implemented: fail-closed. See "Decision record: audit-sink fail-closed"
  immediately below.)*

**G-14. The test that proves G-13 closed could silently not run at all, with a green
summary line. RESOLVED in the session that followed G-13.** `resolveSupabaseGate`
(`packages/api/tests/helpers/supabase-availability.ts`,
`packages/storage/tests/helpers/supabase-availability.ts`) decides whether a Supabase-gated
suite runs by reading `process.env.SUPABASE_URL` at module-collection time. That variable
only reached a given test file's `process.env` if something in *that file's own import
graph* happened to transitively import `packages/shared/src/config/Config.ts`, whose
module-scope `dotenv.config()` call was, until this session, the only place `.env` ever got
loaded. Vitest runs each test file's collection in a worker thread, and worker threads each
get an independent snapshot of `process.env`, so whether a file "saw" `SUPABASE_URL` came
down to which worker it landed in and which sibling files shared that worker, not a real gate
decision. `packages/storage/tests/integration/supabase-nonce-store.integration.test.ts`
(no import path to `Config.ts`; it only imports `SupabaseClientFactory` and
`SupabaseNonceStore`, both dependency-free of `@parmana/shared`'s config module) lost that
coin flip in every run observed across two separate sessions, including the one that first
wrote G-13's "RESOLVED, verified" claim above: the restart-simulation test that is the
*specific* proof `MemoryNonceStore` could not pass ("a nonce consumed through one store
instance is still consumed by a fresh instance against the same backing") was silently
`describe.skipIf`-skipped, not run, every time, with nothing in the `npm test` summary
distinguishing it from a clean pass.

Fix, three parts:

1. **Deterministic env loading.** `vitest.setup.ts` (already registered as the sole
   `setupFiles` entry in `vitest.config.ts`, so every worker always runs it first) now calls
   `dotenv.config({ path: <repo-root>/.env, override: false })` directly, before any test
   file's own imports execute. Every worker now gets an identical, complete env snapshot
   regardless of which test files happen to share it. `Config.ts`'s own `dotenv.config()` call
   is untouched: `override: false` on both sides means neither load can clobber the other or
   an already-set shell variable; it is now simply a no-op the first time a file imports it.
2. **Ambient-env coupling in unit tests: investigated, none found requiring a code change.**
   The working hypothesis going into this fix was that several unit tests (`verification-api`,
   `execute-api`, `receipt-get-api`, `transactions-api`, and peers) implicitly depend on
   `SUPABASE_*` being *absent* to stay on their in-memory storage path, and would need
   `vi.stubEnv`/explicit deletion in `beforeEach`/`afterEach` to stay green once env loading
   became deterministic. Reproducing this directly (full suite runs with `SUPABASE_URL` and
   a key present under the corrected deterministic loading, both with `ALLOW_LIVE_SUPABASE`
   unset (fail-closed gate throws for the 13 gated suites, everything else green) and set (all
   13 gated suites plus every unit test green)) found no such coupling. Reading
   `packages/api/src/bootstrap/createNonceStore.ts` and `createCallerAuditSink.ts` confirms
   why: both branch on `NODE_ENV === "test"` first, unconditionally returning the in-memory
   implementation in test wiring regardless of `SUPABASE_URL`'s presence; the coupling the
   hypothesis assumed does not exist in the production bootstrap code. (A prior, separate
   session had reproduced 13 unit-test failures resembling this hypothesis, but by shelling
   out `set -a; . ./.env; set +a` before `npm test` rather than letting `dotenv` load it;
   that method's real effect was exporting `ALLOW_LIVE_SUPABASE=1`, which happened to still
   be present in `.env` at that point in that session, globally as well, driving every gated
   suite live and concurrent alongside the unit tests, not "`SUPABASE_URL` merely present."
   That confound does not reproduce under `dotenv`-based loading; see verification below.)
3. **Closed the fail-open hole in the gate itself.** `resolveSupabaseGate` previously had only
   three branches: opt-in + configured → run; configured without opt-in → throw; unconfigured
   → skip cleanly. A fourth case was unhandled: opt-in **set** but `SUPABASE_URL`/a key **not
   visible**, which fell through to the "unconfigured" branch and skipped cleanly: exactly
   the silent-skip failure mode this gap describes, just with an explicit opt-in present.
   Both helper copies now throw a dedicated error naming this exact condition ("a live run was
   explicitly requested... but Supabase env is not visible to this worker; env loading is
   broken") instead of degrading to a skip. Explicit intent must never quietly become a green
   skip.

Verified: unit coverage for all four `resolveSupabaseGate` branches in both packages
(`packages/api/tests/unit/supabase-availability.test.ts`,
`packages/storage/tests/unit/supabase-availability.test.ts`, 5 and 4 tests respectively; the
new case in each is "(case d, G-14) throws naming broken env loading when
ALLOW_LIVE_SUPABASE=1 is set but SUPABASE_* is not visible"). With `ALLOW_LIVE_SUPABASE=1`
temporarily appended to this checkout's live-credential `.env`, `npm test` was run three
consecutive times specifically because the original bug was scheduling-dependent and one
green run proves nothing: all three reported an identical `107 passed | 1 skipped (108)`
test files and `478 passed | 1 skipped (479)` tests, zero failures, with the
restart-simulation test confirmed executing and passing (not skipped) via a verbose-reporter
run interleaved between them. (The one remaining skip in every run is the pre-existing,
unrelated `describe.skip` in `execution-failure.integration.test.ts`, not Supabase-gated.)
Before this fix, the same live-opt-in configuration produced `475 passed | 4 skipped (479)`,
the nonce-store suite's 3 tests silently missing, non-deterministically, from run to run.
`ALLOW_LIVE_SUPABASE=1` was removed from `.env` again immediately after verification; `npm
run lint` and `npm run build` both pass clean on the resulting tree.

**Residual, not addressed by this fix:** the two `resolveSupabaseGate` copies remain
independent, hand-maintained duplicates (by design, per each file's own comment; see G-3);
a future divergence between them would not be caught by anything short of manually diffing
the two files or the shared unit-test coverage happening to be kept in lockstep, as it was
this session.

**G-15. A default `npm test` on a machine with live Supabase credentials configured either
threw (pre-G-14 fix) or, independently, could crash test collection outright with a generic
supabase-js error. RESOLVED in the session that followed G-14, in two parts.**

*Part 1: `resolveSupabaseGate` branch 2 semantics changed, deliberately, from G-3's
original design.* The "configured, no opt-in" branch used to throw (G-3's own fix, made
consistent by G-14). It now skips cleanly instead, logging one line naming why
(`"<suiteLabel>: Supabase credentials configured but ALLOW_LIVE_SUPABASE=1 not set —
skipping live suite. Set ALLOW_LIVE_SUPABASE=1 to run it."`). **Trade-off, accepted
deliberately:** the previous throw existed specifically so a contributor with live
credentials in `.env` could not accidentally run live suites without realizing it. Turning
that into a skip means a default `npm test` on such a machine (the common daily-development
case) now stays green and side-effect-free without anyone touching `.env`, at the cost of
reintroducing exactly the silent-by-default posture G-3 was written to close. The other
three branches are unchanged: opted-in + configured still runs live; unconfigured still
skips cleanly; opted-in + **not** visible still throws (G-14's fix stays a hard failure;
explicit intent must never quietly degrade). Both helper copies
(`packages/api/tests/helpers/supabase-availability.ts`,
`packages/storage/tests/helpers/supabase-availability.ts`) and both packages' 4-branch unit
tests were updated in lockstep.

*Part 2: the storage bootstrap crashed test collection independent of the gate.*
`StorageFactory.createFromEnvironment()` (`packages/storage/src/StorageFactory.ts`) built
whatever `PARMANA_STORAGE` named (including a live `SupabaseClient` via
`SupabaseClientFactory.create()`), with no test-mode awareness at all, unlike
`createNonceStore.ts`/`createCallerAuditSink.ts`'s NODE_ENV-gated split (G-13). Worse,
`packages/api/src/repositories.ts` called it as a **module-scope side effect**, so merely
*importing* `repositories.ts` (which every `packages/api` test file does transitively via
`../src/application.js`) constructed live storage, crashing the entire suite with
supabase-js's generic `"supabaseUrl is required."` the moment `SUPABASE_URL` was absent
while `PARMANA_STORAGE=supabase` was still set (as it is in this checkout's `.env`),
confirmed directly: 22 files failed this way when `.env`'s Supabase lines were commented out
without also changing `PARMANA_STORAGE`. Fixed two ways:

- `createFromEnvironment()` now returns `MemoryStorageProvider` unconditionally when
  `NODE_ENV === "test"`, **regardless of `PARMANA_STORAGE`**, mirroring
  `createNonceStore`/`createCallerAuditSink` exactly. Outside test mode, behavior is
  unchanged except that `PARMANA_STORAGE=supabase` with no visible credentials now throws a
  Parmana-worded error naming both knobs (`PARMANA_STORAGE=supabase requires SUPABASE_URL
  and a Supabase key...`) before `SupabaseClientFactory.create()` would otherwise fail with
  its generic message.
- `repositories.ts` no longer constructs storage at module scope. The exported
  `businessTransactionRepository`/`executionTrustRecordRepository` bindings are now Proxies
  that defer the real `StorageFactory.createFromEnvironment()` call to first property
  access. The interface at every call site (`application.ts`, both integration tests that
  import these directly) is unchanged; only the timing of construction moved.

**Trade-off, accepted deliberately (same shape as Part 1's):** because the in-memory
override is unconditional under `NODE_ENV=test`, tests that set `PARMANA_STORAGE=supabase`
in their own `beforeAll` specifically to exercise real persistence through the shared
`packages/api/tests/test-app.ts` app singleton can no longer reach a live backend through
that singleton, full stop. `ALLOW_LIVE_SUPABASE=1` does not change this, since it is a
`resolveSupabaseGate` concern, not a `StorageFactory` one. Two concrete casualties,
confirmed directly:
- `packages/api/tests/unit/transactions-api.test.ts`'s three `it.skipIf(!supabaseConfigured)`
  persistence-shape cases still pass under a live opt-in run, but now silently exercise the
  in-memory path rather than real Supabase persistence; their gating on live credentials is,
  after this fix, no longer meaningful. Not changed this session; flagged here since nothing
  in the test output signals the silent downgrade.
- `packages/api/tests/integration/workflow-supabase.integration.test.ts`'s "round-trips an
  override through the Supabase repository and still verifies" case failed outright (not
  silently) under a live opt-in run, because it writes an override through its own
  directly-constructed `SupabaseStorageProvider` and then verified by calling
  `request(app).post("/verify")`, and `app`'s repositories, unlike the directly-constructed
  one, are now always in-memory under test, so the record it just wrote to real Supabase was
  never visible to that HTTP call → 404. Fixed in this session by verifying against the same
  directly-constructed `storage.trustRecords` instead, via a directly-instantiated
  `VerificationService` (`@parmana/runtime`), the exact class the real `/verify` route
  delegates to (`ExecutionTrustApplication.verify`), so this still exercises real production
  verification logic against the real repository; it no longer additionally proves the HTTP
  endpoint wires to it, which the file's first test ("executes a Business Transaction",
  unaffected, still routes end-to-end through `app`) already covers.

Verified:
- Unit: `packages/storage/tests/unit/storage-factory.test.ts` (5 tests: NODE_ENV=test forces
  in-memory regardless of `PARMANA_STORAGE`, with and without credentials present; the named
  misconfiguration error outside test mode; unaffected `supabase`/`memory` behavior outside
  test mode) and `packages/api/tests/unit/repositories.test.ts` (2 tests, using
  `vi.doMock`/`vi.resetModules`: importing the module performs zero calls to
  `StorageFactory.createFromEnvironment`; the first repository property access constructs
  exactly once, memoized across both exported repositories).
- (a) `npm test` with this checkout's live-credential `.env` as-is, no opt-in: 0 failed
  files, all 13 previously-gate-throwing suites now skip cleanly logging the new branch-2
  message (confirmed by grep: 13 occurrences, 0 remaining `"Refusing to run"` throws), plus
  the 1 pre-existing unrelated `execution-failure.integration.test.ts` skip, everything else
  green (`97 passed | 13 skipped (110)` files, `455 passed | 33 skipped (488)` tests).
- (b) `ALLOW_LIVE_SUPABASE=1` set for a single process invocation only (never written to
  `.env`), run twice consecutively: both runs identical, `109 passed | 1 skipped (110)`
  files, `487 passed | 1 skipped (488)` tests, 0 failures, restart-simulation test confirmed
  passing (not skipped) via an interleaved verbose run.
- (c) A single invocation with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`
  set to empty strings for the process only (unsetting them outright doesn't work: `.env`'s
  real values would just backfill via `dotenv`'s `override:false`; an explicit empty string
  is what `override:false` actually respects), simulating a fresh clone without editing
  `.env`: all 13 gated suites skip via the unconfigured branch (verified via grep: their
  `[SKIP] ... not set` messages, not the branch-2 message), 0 failed files, nothing crashes
  at collection despite `.env`'s `PARMANA_STORAGE=supabase` still being set underneath;
  this is the direct proof Part 2 closes the collection-crash bug.
- `npm run lint` and `npm run build` both clean throughout.

**G-19. `POST /execute` returns HTTP 500 for an expected policy rejection, and neither the
rejection nor the approval response surfaces the policy's plain-language `reason`.** Found
2026-07-21 while building a parmanasystems.com live-proof widget route
(`packages/api/src/routes/public-demo.ts`, since removed 2026-07-21 along with the widget
it backed; see the frontend's own history for why) that worked around both issues by
calling `PolicyEngine.evaluate()` directly rather than relying on `/execute`'s response.
That workaround route is gone; this gap is not: it is a property of `/execute` and the
shared `runtime`/`shared` packages, entirely independent of the now-deleted route, and was
never fixed. Two distinct issues on the real, existing `/execute` route:
1. **Status code.** `ExecutionGate.enforce()` (`packages/runtime/src/ExecutionGate.ts:31-44`)
   throws a bare `RuntimeError` for a rejected `Decision`, which defaults to `status: 500`
   (`packages/runtime/src/errors/RuntimeError.ts:6-20`); every policy rejection currently
   reaches the caller looking identical to a server crash, even though
   `DecisionOutcome.REJECTED` is an ordinary, expected outcome of policy evaluation, not a
   fault.
2. **Missing reason field.** `Decision.reason` (`packages/shared/src/domain/decision.ts:52`)
   already carries the exact plain-language string from the matched policy rule
   (`policies/<name>/<version>/policy.json`'s `outcome.reason`) all the way through
   `DecisionBuilder.build()` (`packages/runtime/src/DecisionBuilder.ts:57-67`), and
   `ExecutionGate.enforce` does interpolate it into its thrown message
   (`packages/runtime/src/ExecutionGate.ts:38-42`), but `ExecutionTrustRecord`
   (`packages/shared/src/domain/execution-trust-record.ts`) has no `decision` field at all,
   so on the APPROVED path the reason is dropped entirely, and on the REJECTED path a caller
   only gets it as an unstructured substring of `error` inside the generic `RuntimeError`
   message (`"Execution rejected: <reason>"`), never a dedicated field.

Neither issue touches this codebase's core CLAIMS.md claims: fail-closed still holds,
nothing here weakens the signature or verification chain. But any real API consumer today
has no clean way to distinguish "policy said no" from "the server broke," and no structured
access to why. **Not fixed this pass**, flagged only, per explicit instruction to keep the
live-proof-widget work scoped and avoid touching the shared runtime/API packages.

---

### Decision record: audit-sink fail-closed

**Decided and implemented** in the audit-sink/G-1 hardening session that followed G-13
(directly resolves the open question G-13 left above): if a `CallerAuditSink.record()` write
fails, the request now fails closed. An action that executes without an audit record
contradicts Parmana's core claim of independently verifiable execution, so the availability
cost of rejecting the request is accepted, consistent with the `NonceStore`'s own
fail-closed wiring (G-13). This was a deliberate design decision, not a bug fix; it is
recorded here so the decision itself is discoverable in the gap tracker, not only in session
history.

Implementation: `packages/api/src/middleware/caller-auth.ts`'s `recordOrFailClosed` helper
wraps both `auditSink.record()` call sites (the `caller.rejected` path and the
`caller.authenticated` path). On failure, it logs a structured entry
(`{ event: "caller_audit_write_failed", route, error }`, distinguishable from other
failures) and passes a new `AuditUnavailableError`
(`packages/api/src/auth/AuditUnavailableError.ts`, extends `RuntimeError`: 503,
`AUDIT_UNAVAILABLE`) to `next()`, which `error-handler.ts`'s existing generic
`instanceof RuntimeError` branch maps with no changes to that file. The success path is
byte-for-byte unchanged. Deliberately no retry, buffering, or queueing: that would convert
fail-closed into eventually-audited, a materially different (and rejected) design; see
"Decisions left for the owner" in this session's closing report if a retry layer is ever
reconsidered.

Verified: 6 unit tests directly against the middleware
(`packages/api/tests/unit/middleware/caller-auth.test.ts`): both success paths unchanged
(valid credential reaches `next()` with no error, missing credential still gets its 401),
both failure paths reject with `AuditUnavailableError` (status 503, code
`AUDIT_UNAVAILABLE`) rather than a 401 or a silent pass-through, the structured log entry's
exact shape, and that the sink is called exactly once (no retry). Plus the pre-existing
`packages/api/tests/unit/supabase-caller-audit-sink.test.ts` (G-13 session), which already
proves `SupabaseCallerAuditSink` propagates storage errors rather than swallowing them,
required for this guard to be reachable at all in production wiring.

### cosmetic

**G-10. CLAIMS.md citations that are vague or indirect** rather than pointing at a specific
test:
- **2.7 Replay Support** cites only "Replay package" and "G-08", no test file named, even
  though `packages/replay/tests/unit/replay-engine.test.ts` and
  `packages/replay/tests/replay.integration.test.ts` (6 files, 9 tests total) are real and
  always-run.
- **2.9 Independent Envelope Verification** cites `packages/envelope-verifier/README.md`
  ("Claims" section), a documentation file, not a test.
- **3.2 Fleet-Wide Single-Use** cites the same README pattern.
- **2.1, 2.2, 2.3, 2.4** cite class names only (`BusinessTransactionValidator`,
  `PolicyRouter`, `PolicyValidator`) with no test file named, and, checked directly this
  pass, **`BusinessTransactionValidator` and `PolicyRouter` have no dedicated test file
  anywhere in the repo**, only indirect coverage through other tests
  (`ReferencePolicies.test.ts`, `ReferencePoliciesEvaluation.test.ts` for
  `PolicyValidator`; nothing dedicated for the other two).

None of these claims are false; the underlying capability is real, verified by tests
elsewhere in the suite. But a reader following CLAIMS.md's own citation cannot find the
proof without independently searching for it, which is the exact failure mode CLAIMS.md's
discipline exists to prevent.

**G-11. PARTIALLY CLOSED in the 2026-07-17 session.** `EXECUTION_AUTHORIZATION_TTL_SECONDS`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `CRYPTO_MODE`,
`RECEIPT_VERSION`, and `DATABASE_URL` are read by `packages/shared/src/config/Config.ts`.
The new root `.env.example` now documents every environment variable confirmed (by grep)
to be read anywhere in `packages/*/src`, including all of these, with `CRYPTO_MODE`
annotated as dead per G-4. What remains open: the public docs site
(`guides/deploy-patterns.mdx`, `deployment/local.mdx`, `cryptography/overview.mdx`) still
does not mention them. `.env.example` is a better source of truth than doc prose (it
can't drift as invisibly), but the site itself was not updated this session.

---

## Decision required (options, not fixes)

### D-1. Duplicate Business Transaction race (G-1)

**Option A: fix the race.** Add a real uniqueness guard to
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

**Option B: document the limitation.** State plainly on `reference/storage.mdx` and
`guides/deploy-patterns.mdx` that `memory` storage is not safe under concurrent duplicate
submissions of the same `businessTransactionId` and is not intended for anything beyond
local development, matching its existing framing everywhere else on the site. *Estimated
size: trivial, a docs paragraph, no code change. Leaves the underlying bug in place for
anyone who does run `memory` storage under real concurrent load, including any pilot that
starts on `memory` before migrating to Supabase.*

I lean toward Option A being cheap enough that Option B alone under-serves anyone actually
running a pilot on `memory` storage under load, but this is a real design/priority call.

**Status: RESOLVED. Option A implemented as written above**, in the audit-sink/G-1
hardening session that followed the G-13 session. See G-1's own entry above for what
changed and how it's verified. One point the estimate above didn't anticipate:
`DuplicateBusinessTransactionError` had to move from `@parmana/runtime` to `@parmana/shared`
to avoid a circular package dependency; also documented in G-1's entry.

### D-2. Hybrid/PQ dead configuration (G-4)

**Option A: wire `createHybrid()` behind the env vars.** In each of the three call sites
(`RuntimeAuthorizationSigner`, `ExecutionTrustRecordBuilder`,
`createConnectorRegistry.ts`), branch on `config.crypto.mode` (or simply on whether
`SECONDARY_SIGNATURE_PROVIDER` is set) to call `CryptoBootstrap.createHybrid()` instead of
`.create()`, and thread the resulting `SignatureBundle` through
`SignedExecutionAuthorization`/`ExecutionTrustRecord`/`Receipt` shapes, which today assume
one `Signature`, not a bundle; this is the real complexity, not the `CryptoBootstrap` call
itself. **Tests that would prove it end to end**: an HTTP-level test asserting
`POST /execute`'s response `signature` (or a new `signatures` field) contains both an
Ed25519 and an ML-DSA-65 signature when `SECONDARY_SIGNATURE_PROVIDER=dilithium3` is set,
and that a receipt/verification still round-trips. *Estimated size: medium-to-large, this
touches the `ExecutionTrustRecord`/`Signature` domain shape (a breaking or additive schema
change, needs its own design decision), the Supabase schema (`signature_json` column
currently assumes one signature), and CLAIMS.md 2.14/2.8 (which would need updating to
claim hybrid-in-production, not just hybrid-as-a-library-capability). Not a same-day change.*

**Option B: remove the dead config, document as single-provider by design.** Delete
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

**Option A: wire it in.** Add a `POST /overrides` (or similar) route calling
`OverrideService`, and a test suite proving its actual business rules (duplicate-override
rejection, missing-transaction/missing-trust-record errors), replacing the storage-layer
bypass test with a real one. *Estimated size: small-to-medium, the service already exists
and is presumably complete; this is mostly route wiring plus tests, roughly a day.*

**Option B: remove it, or explicitly mark it `[FUTURE]`.** If overrides aren't meant to be
externally triggerable yet, delete the unused service (it's dead code by the same
definition applied elsewhere in this audit) or add a CLAIMS.md `[FUTURE]` entry and a
`reference/runtime.mdx` note that override application is a domain concept modeled in code
but not yet exposed. *Estimated size: trivial either way.*

---

## Top 5 to close first, if a bank's security team were reviewing next week

1. **G-1, duplicate-transaction race: RESOLVED.** Option A implemented as written: atomic
   `Map.has`/`Map.set` in the same tick for the in-memory repository, `23505` mapping for
   the Supabase repository, both throwing the same `DuplicateBusinessTransactionError`
   (relocated to `@parmana/shared` to avoid a circular dependency; see G-1's own entry).
2. **G-3, live credentials used silently by default: RESOLVED.** The "silently" half is
   fixed: an `ALLOW_LIVE_SUPABASE=1` opt-in is now required, hard-failing with a named
   error otherwise. The cleanup half remains: no test deletes the real rows it writes once
   opted in. *Remaining work: a cleanup step (or a dedicated, disposable test project) so
   an opted-in `npm test` stops leaving permanent rows in a real database, a day, mostly
   cleanup-hook work across 10 test files.*
3. **G-2, no CI: CLOSED 2026-07-17.** `.github/workflows/ci.yml` now runs the full suite
   on every push and PR. Supabase-gated tests are excluded there (no project secrets
   configured in CI) and rely on local runs; the decision this note flagged as worth
   making explicitly was made explicitly: local-only for now, revisit if fleet-wide
   Supabase coverage in CI becomes a priority.
4. **G-4, hybrid/PQ dead config** (Option B first, Option A if roadmapped): Option B alone
   closes the "config that silently does nothing" trap same-day; Option A is a real project.
   *Trivial for B, weeks for A.*
5. **G-5, OverrideService unreachable** (Option A or B, either closes the ambiguity): right
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

---

## Legacy documentation tree terminology sweep, closed 2026-07-17

Previously deferred (see prior revision of this document): `docs/00-introduction`,
`docs/rfcs`, `GOVERNANCE.md`, `docs/01-concepts` through `docs/03-api`, `docs/adr`, and
`typescript/docs/06_autonomous_vehicle.md` through `typescript/docs/09_multi_agent.md`
predate the Mintlify site (`docs/site`) and were left untouched during an earlier
terminology sweep that updated `docs/site`, `README.md`, `packages/connector-sdk/
package.json`, and the affected tutorial READMEs.

The 2026-07-17 audit closeout session swept the remainder: `GOVERNANCE.md`,
`docs/00-introduction/PROBLEM.md`, `docs/rfcs/RFC-0012-Phase-1-Architecture-Completion.md`,
`typescript/docs/06_autonomous_vehicle.md` through `09_multi_agent.md`,
`docs/architecture/EXECUTION-FLOW-AUDIT.md`, `docs/architecture/KEY-MANAGEMENT.md`, and
`docs/specifications/reference-policies.md`. A fresh repo-wide grep confirms
`docs/01-concepts` through `docs/03-api` and `docs/adr` never actually contained the
retired term (zero matches); nothing to sweep there. See "Gaps closed in the 2026-07-17
audit closeout session" above (item 19) for the two files intentionally left unswept (an
external citation that is itself correctly named "Execution Governance") and the CI guard
now in place against regression.
