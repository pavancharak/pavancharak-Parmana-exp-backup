# GAP AUDIT: Full Codebase Investigation

*Investigation-only session. Zero source changes. Snapshot: 2026-07-07, `main` @ `4a3c2b9`.*

**Live test baseline** (run this session, per-package to work around a root-level
`vitest run` early-abort; see MUST-FIX-3):

| Workspace | Test files | Tests | Pass | Fail | Skip |
|---|---|---|---|---|---|
| `packages/*` (11 packages) | 58 | 227 | 224 | **2** | 1 |
| `typescript/` (client SDK) | 9 | **0** | n/a | n/a | n/a |
| `python/` (client SDK) | 11 | 26 | 26 | 0 | 0 |

The 2 failures are `execution-gateway`'s `"rejects an unknown payload version"` (both the
Ed25519 and dilithium3 variants); see MUST-FIX-1, the headline finding of this audit.

---

## 1. Executive summary

The v1 payload-version revert is real and correct in every committed source file, but a
stale, gitignored `dist/` build in `packages/crypto` and `packages/envelope-verifier` still
implements the pre-revert protocol (`SUPPORTED_PAYLOAD_VERSION = 2`, full precondition
machinery), and every cross-package consumer resolves through that stale build, not
source, because workspace `package.json` `exports` point at `dist/`. This is live, provable
right now by the 2 failing tests, and it is why `docs/CLAIMS.md`'s "reverted to v1" claim
does not actually hold at the integration boundary today. Two more independent-severity
findings: the API has no authentication or authorization on any route (fully open,
confirmed, matches a historically-flagged-but-never-closed roadmap concern), and
`DATABASE_PROVIDER=supabase` in `.env` is silently dead: the live storage-provider switch
reads a different, undocumented env var (`PARMANA_STORAGE`), so the deployment is currently
running in-memory storage while believing it's on Supabase. The highest-risk gap is
MUST-FIX-1: it is the only finding here that is both currently observable (test failures,
not just static reasoning) and directly falsifies a written security claim.

What's genuinely solid: the canonical serializer, the envelope verifier's check ordering,
the nonce store's documented scope, the crypto package's own test discipline, and the
error handler's non-leaking failure path. See §7.

---

## 2. MUST-FIX register

### MUST-FIX-1: Stale `dist/` builds resurrect the reverted v1→v2 payload/precondition protocol at every package boundary

**Files:**
- `packages/crypto/dist/AuthorizationVerifier.js:10`: `SUPPORTED_PAYLOAD_VERSION = 2` (stale)
- `packages/crypto/src/AuthorizationVerifier.ts:17`: `SUPPORTED_PAYLOAD_VERSION = 1` (current, committed at HEAD, confirmed via `git show HEAD:packages/crypto/src/AuthorizationVerifier.ts`)
- `packages/envelope-verifier/dist/EnvelopeVerifier.js:2`: imports `./PreconditionEvaluator.js`, a compiled module with no corresponding `.ts` source anywhere in the tree (deleted in the revert; `dist/PreconditionResolver.js` likewise orphaned)
- `packages/crypto/package.json` / `packages/envelope-verifier/package.json`: `"exports"."."` → `"./dist/index.js"`, so `node_modules/@parmana/crypto` (a workspace symlink to `packages/crypto`, confirmed via `ls -la node_modules/@parmana/crypto`) resolves to the stale build for any *cross-package* importer

**Why it matters:** `packages/execution-gateway/test/execution-gateway.test.ts:310-339` and
`execution-gateway.dilithium3.test.ts:290-...` tamper a signed authorization's
`payload.version` to `2` and assert rejection (`/versionSupported/`). Both fail: the
request is accepted and executed (`success: true` in the resolved value), because
`execution-gateway` imports `@parmana/crypto`/`@parmana/envelope-verifier` via the
`node_modules` symlink, which resolves to `dist/`, which still treats version `2` as
supported. Meanwhile `packages/crypto`'s and `packages/envelope-verifier`'s *own* test
suites import their sibling `../src/*.ts` directly (confirmed:
`envelope-verifier/test/envelope-verifier.test.ts:15` imports `../src/EnvelopeVerifier.js`)
and so exercise the correct, current v1 code and pass, masking the problem from a
per-package test run. `docs/CLAIMS.md` §5's implicit "v1 is canonical, preconditions are
gone" position, and `03-CLAIMS-POSITION.md`'s content-binding claims, do not hold for any
consumer that imports these two packages as a dependency rather than testing them in
isolation, which in production is *every* consumer, since `execution-gateway` (and
transitively the API/runtime) always imports across the package boundary.

**Confirmed local, not upstream-in-history:** `dist/` is gitignored
(`.gitignore:88`, `git ls-files packages/crypto/dist` returns nothing) and the committed
source at HEAD already has the correct v1 constant; this is a stale local build artifact
from before the day's revert-session edits (`dist/AuthorizationVerifier.js` mtime
2026-07-07 04:50 vs. `src/AuthorizationVerifier.ts` mtime 2026-07-07 09:52), not a defect in
committed history. `README.md:803`'s documented `npm run build` (`tsc -b`, per root
`package.json`) would regenerate it correctly.

**Smallest honest fix:** run `npm run build` (or delete both packages' `dist/` and
rebuild) to eliminate today's staleness (a micro-edit, no code change). The **systemic** gap
that let this happen silently (nothing rebuilds workspace deps before tests run, and
nothing detects/fails on a stale `dist/`) has no equally small fix; closing it for real
(a pretest build step, or a dev/test-time source-resolution path via `exports` conditions
or `tsconfig` paths) is a micro-session, not a one-liner, and changes build tooling, so
should not ride with an unrelated change.

**Size:** micro-edit (rebuild now) + micro-session (prevent recurrence).

---

### MUST-FIX-2: API has no authentication or authorization on any route

**Files:** `packages/api/src/app.ts:1-97` (full route table), `packages/api/src/server.ts`

**Why it matters:** `app.use(express.json())` is the only middleware registered before
every route (`/execute`, `/verify`, `/verification`, `/receipt`, `/transactions`,
`/policies`, `/trust-records`, `/replay`); there is no API-key, bearer-token, session, or
IP-allowlist check anywhere in `packages/api/src` (confirmed by grep for
`Authorization`/`Bearer`/`apiKey`/`x-api-key`/`requireAuth` across the package; zero
matches). Anyone who can reach the port can submit business transactions, read receipts and
trust records, and trigger replay. This is not a new discovery; `04-INCIDENTS-LOG.md`
frames the *whole system's* value as resting on requests being routed through Parmana's
verification, and `03-CLAIMS-POSITION.md:46-54`'s conditional claims already concede
"Parmana enforces nothing at the network level", but the API itself having zero
authentication of its own callers is a distinct, unscoped-anywhere gap, not just the
already-conceded network-level one.

**Smallest honest fix:** document the gap explicitly wherever `03-CLAIMS-POSITION.md`
discusses deployment assumptions (it currently discusses *envelope* verification being
opt-in, not *API* access being unauthenticated; these are different claims), and treat
adding auth middleware as its own dedicated session (it touches every route + needs a
credential/rotation story, not a drive-by).

**Size:** session (auth middleware + design) for the fix; micro-edit for the documentation gap.

---

### MUST-FIX-3: Storage provider silently defaults to in-memory; `.env`'s `DATABASE_PROVIDER=supabase` is dead configuration

**Files:**
- `.env` (root): `DATABASE_PROVIDER=supabase`
- `packages/shared/src/config/ConfigValidation.ts:30`: parses `DATABASE_PROVIDER` into `Config.storage.provider` (`packages/shared/src/config/Config.ts:233-236`)
- `packages/storage/src/StorageFactory.ts:35-40`: `createFromEnvironment()` reads `process.env.PARMANA_STORAGE ?? "memory"` (**a different env var name**)
- `packages/api/src/repositories.ts:8`: `StorageFactory.createFromEnvironment()`, called at **module import time**, top-level

**Why it matters:** two independent, disconnected config paths exist for the same concept.
`Config.storage.provider` (built from `DATABASE_PROVIDER`, validated against the
`StorageProviders` enum, confirmed via grep to have **zero consumers anywhere in the
tree**, dead config) is not what actually selects the provider. The live path,
`StorageFactory.createFromEnvironment()`, reads `PARMANA_STORAGE`, which `.env` never sets,
so it silently falls back to `"memory"` right now, in this repository's own configured
environment, despite the operator's `.env` explicitly declaring `DATABASE_PROVIDER=supabase`.
Anyone relying on Supabase persistence today is silently getting `MemoryStorageProvider`
(state lost on every process restart) instead. Separately, `StorageFactory.create()`
(`StorageFactory.ts:16-30`) is a `switch` with no `default` case over a value that is
`as`-cast from a raw env string with no runtime validation (unlike the parallel, unused
`DATABASE_PROVIDER` path, which *does* validate), an unrecognized `PARMANA_STORAGE` value
falls through to an implicit `undefined` return, which will throw a confusing
"Cannot read properties of undefined" several call-frames away from the actual cause
(`repositories.ts:15-17`).

**Smallest honest fix:** pick one env var name, wire `StorageFactory.createFromEnvironment()`
to read it with the same validation `ConfigValidation.ts` already has, delete the other
path. Micro-session (touches config + storage factory + whatever currently depends on the
`PARMANA_STORAGE` name in deployment scripts, if any; worth checking before renaming).

---

### MUST-FIX-4: `PARMANA_POLICY_DIR` has no fallback; confirmed still broken on a fresh clone

**Files:** `packages/shared/src/config/Config.ts:286-289` (`process.env.PARMANA_POLICY_DIR!`),
`packages/api/src/application.ts:32-38` (`loadConfig()` and `FilePolicyRepository`
construction both run at **module import time**, top-level, not lazily)

**Why it matters:** this is the Tier-1 item from `02-REMAINING.md:32-34`, confirmed still
open, not yet fixed. The non-null assertion silences the type system but does nothing at
runtime: an unset `PARMANA_POLICY_DIR` produces `directory: undefined`, and
`FilePolicyRepository` is constructed with it at import time, before any route runs. A bare
clone with no `.env` (or an `.env` missing this var) will fail as soon as `application.ts`
is imported, i.e., as soon as `app.ts` is imported, i.e., as soon as the server starts or
any API test file loads it.

**Smallest honest fix:** repo-relative fallback (e.g. resolve against the monorepo root),
exactly as already scoped in `02-REMAINING.md`. Micro-session (already correctly sized
there).

---

## 3. SHOULD-FIX register

### SHOULD-FIX-1: Duplicated `ExecutableContent` extraction confirmed still live (Session 8 item, now precisely located)

**Files:** `packages/runtime/src/RuntimeEngine.ts:119-126` (calls the shared
`toExecutableContent()` from `packages/shared/src/domain/executable-content.ts:48-60`) vs.
`packages/runtime/src/ExecutionRequestBuilder.ts:24-38` (manually re-lists
`businessTransactionId`/`action`/`target`/`parameters` from `transaction`/`transaction.intent`
without calling `toExecutableContent()`). Both derive the same four fields from the same
source shape independently. No drift today (both produce identical values), but nothing
enforces they can't drift, exactly the concern `02-REMAINING.md:12-16` names. Smallest
honest fix: have `ExecutionRequestBuilder.build()` call `toExecutableContent()` too, or add
a cited test proving the two field lists can't diverge. Micro-edit.

### SHOULD-FIX-2: `docs/CLAIMS.md` and root `claim.md` are not valid rendered markdown

`docs/CLAIMS.md` escapes every `#`, `*`, and horizontal rule (`\#`, `\*`, `\---`) that
doesn't need escaping in standard CommonMark; the file as committed renders with literal
backslashes in most viewers. Root `claim.md` (tracked, added in `987e64d`, 760 lines) has
the inverse problem: literal undecoded HTML entities (`&#x20;`) scattered through an ASCII
diagram, evidence of a bad copy/export. `claim.md` is also a near-duplicate, less
authoritative, less current sibling of `docs/CLAIMS.md`/`03-CLAIMS-POSITION.md` sitting at
repo root with no cross-reference to either. Smallest honest fix: re-save `docs/CLAIMS.md`
without the spurious escaping; decide whether `claim.md` is superseded scratch work to
archive or fold into the real claims docs. Micro-edit for the escaping; a judgment call
(not a fix) for `claim.md`'s disposition, flagging per the "report, don't touch" rule.

### SHOULD-FIX-3: `typescript/` client SDK: all 9 test files are empty stubs (0 bytes each)

`Configuration.test.ts`, `Errors.test.ts`, `HealthApi.test.ts`, `HttpTransport.test.ts`,
`ParmanaClient.test.ts`, `PolicyApi.test.ts`, `ReplayApi.test.ts`, `RuntimeApi.test.ts`,
`VerificationApi.test.ts` under `typescript/test/` are all literally 0 lines
(`wc -l` confirms each). This is not a vitest misconfiguration (`vitest run` from
`typescript/` correctly reports "9 passed, no tests"; the config is fine, the files are
just empty placeholders). This is the entire published client SDK with zero behavioral test
coverage. Session-sized: writing real coverage for 9 API surface areas is not a micro-edit.

### SHOULD-FIX-4: `ExecutionEvidenceComponent` is a dead no-op pipeline stage

`packages/runtime/src/components/ExecutionEvidenceComponent.ts:24-36`: `execute()` returns
`context` unchanged with a `// TODO: Build ExecutionEvidence from enterprise execution
result.` comment where its body should be. Confirmed unreferenced anywhere else in the tree
(grep for the class name matches only its own file); it is not wired into any live
pipeline, so it is dead code rather than a live pass-through-that-validates-nothing. Low
urgency; either finish it or delete it. Micro-edit either way.

---

## 4. KNOWN-PARKED confirmations (against `02-REMAINING.md`)

| Item | Roadmap state | Confirmed current state |
|---|---|---|
| `OverrideService`/`OverrideVerifier` unreachable from any route | Guarded, Tier 0 | **Still true.** Grep for `OverrideService`/`OverrideVerifier` outside `dist/`/tests finds only `packages/runtime/src/policy/OverrideVerifier.ts` and `packages/runtime/src/services/override-service.ts` themselves; zero references from `packages/api/src/**` or any route table. |
| Orphaned Replay/Storage subsystems unreachable from `/replay` | Tier 1 cleanup item | **Still true** for the storage side (`LedgerSerializer`/`AppendOnlyLedger`/`StorageEngine` have no importers outside their own tests, confirmed via the same grep pattern). Not independently re-verified for `ReplayExecutor`/`ReplayPipeline` this session beyond confirming their test files still exist and exercise them in isolation. |
| `LedgerSerializer` replacer-array bug | Documented, dead code, non-urgent | **Confirmed precisely.** `packages/storage/src/ledger/LedgerSerializer.ts:9`: `JSON.stringify(entry, Object.keys(entry).sort())`: the array second argument is a global key allowlist applied at every recursion level, computed once from the top-level entry's keys, so any nested `payload` object whose own keys don't also appear at the top level serializes as `{}`. Exactly matches the behavior asserted by `packages/storage/test/LedgerSerializer.test.ts`'s "does not reflect nested payload changes" test title. |
| `PARMANA_POLICY_DIR` no repo-relative fallback | Tier 1, open | **Confirmed still open**; see MUST-FIX-4 (more precisely located: `Config.ts:288` + eager construction at `application.ts:32-38`, not just "routes 500," the whole module fails to import cleanly). |
| Supabase repo construction throws at import before skip gates run | Tier 1, open | **Partially superseded by a bigger finding.** In the current `.env`, this doesn't reproduce today only because of the `PARMANA_STORAGE`/`DATABASE_PROVIDER` name mismatch (MUST-FIX-3) accidentally defaulting to memory. The eager-construction-at-import shape the roadmap describes is confirmed (`repositories.ts:8`, top-level `const storage = StorageFactory.createFromEnvironment()`), and would still throw immediately once the env var name is fixed, if `SUPABASE_URL`/keys are also unset. |
| `execution-failure.integration.test.ts` permanently skipped, stale justification | Tier 1 | Not re-investigated this session beyond the baseline run showing 1 skipped test in `packages/api`, consistent with the roadmap's description, not independently re-diagnosed. |

---

## 5. Per-lens findings

### Lens 1: Claims vs. code
See §6 (Claims scorecard) for the claim-by-claim table. Headline result: MUST-FIX-1 means
the implicit "preconditions/v2 are gone" position is **STALE at the integration boundary**
even though every committed source file is correct, a distinction CLAIMS.md doesn't
currently have room to express (it speaks about source, not about what's actually resolved
at runtime across package boundaries). No other surviving `PreconditionResolver`/
`preconditionsHold`/payload-v2 references were found in `docs/`, `docs/site/**`, or code
comments outside the stale `dist/` artifacts and their `.d.ts`/`.map` siblings.

### Lens 2: Dead, unreachable, and orphaned code
Covered above: `OverrideService`/`OverrideVerifier` (§4), Replay/Storage orphans (§4),
`LedgerSerializer` (§4), `ExecutionEvidenceComponent` (SHOULD-FIX-4). One additional
TODO found: `packages/runtime/src/components/ExecutionEvidenceComponent.ts:29` (the only
non-test, non-dist `TODO`/`FIXME` in the entire `packages/` tree, a genuinely clean
signal on this axis otherwise).

### Lens 3: Security surface
- Key material: `keys/COMPROMISED-2026-07-05/default.{private,public}.pem` exists in the
  working tree but is **untracked and gitignored** (`git ls-files keys/` returns nothing;
  `.gitignore:71` covers `keys/`), and is not referenced by any code path (grep finds zero
  hits outside docs/incident-log prose); it appears to be the rotated-out compromised key
  kept as a local incident artifact, not a live risk, but its presence on disk at all is
  worth the operator's attention.
- No `.pem` or inline key material found anywhere else in the tree or in test fixtures.
- API auth: see MUST-FIX-2, confirmed still fully open.
- Fail-open hunting: `AuthorizationVerifier.verify()` (`packages/crypto/src/
  AuthorizationVerifier.ts:78-92`) fails closed correctly (unrecognized version →
  all checks false). `EnvelopeVerifier.evaluatePreconditions()` in the **stale dist**
  build fails closed when a resolver is required but missing (`preconditionsHold: false`,
  reason `"resolver-required"`), consistent fail-closed design, just running stale code.
  No fail-open branch found in any verifier's error handling this session.
- Nonce store: `MemoryNonceStore` (`packages/envelope-verifier/src/MemoryNonceStore.ts`)
  is honestly documented in its own doc comment as process-scoped and lossy on restart,
  matching CLAIMS.md 3.2 exactly: HOLDS.
- Express/error handling: `packages/api/src/middleware/error-handler.ts` never leaks a
  stack trace to the client (unexpected errors get a generic 500; only `console.error`
  server-side). No CORS package in use; no explicit cross-origin policy either way. No
  explicit body-size-limit override (defaults to `express.json()`'s 100kb).

### Lens 4: Determinism and hash-boundary integrity
- `CanonicalSerializer` (`packages/crypto/src/CanonicalSerializer.ts`) is confirmed the
  single serializer for signing/hashing paths (used by `AuthorizationSigner`,
  `AuthorizationVerifier` via `SignatureVerifier`, `TrustRecordHasher`, `ArtifactSigner`);
  it recursively sorts keys at every level and converts `Date` to ISO string
  (`normalize()`, lines 29-70); no second serialization path found for signed/hashed
  domain artifacts. The one non-canonical `JSON.stringify` outside this class,
  `LedgerSerializer`, is in confirmed-orphaned code (§4).
- `toExecutableContent()` (`packages/shared/src/domain/executable-content.ts:48-60`):
  explicit 4-field selection (`businessTransactionId`, `action`, `target`, `parameters`),
  called from `ExecutionGateway.ts:139` and `RuntimeEngine.ts:120`. See SHOULD-FIX-1 for
  the parallel manual extraction in `ExecutionRequestBuilder`.
- Scaled-integer rule: not located as an enforced check anywhere in `packages/shared`,
  `packages/api`, or `python/` this session; flagged for follow-up rather than asserted
  either way; time budget did not allow tracing every numeric ingestion path.

### Lens 5: Test coverage honesty
| Package | Test files | Source files | Note |
|---|---|---|---|
| `receipt` | **0** | 3 (`ReceiptBuilder.ts`, `ReceiptEngine.ts`, `index.ts`) | Confirmed zero test files package-wide. |
| `execution-control` | 1 (195 lines, 11 tests) | 12 | `CredentialVault`, `SecureConnector`, `ConnectorAuthenticator`, `GatewaySessionStore` (the credential-brokering scaffold) share one test file; individual class-level behavior is not obviously isolated. |
| `execution-system` | 1 (1 test) | 6 | `DefaultExecutionSystem` is an explicit placeholder implementation; thin coverage matches its stated non-production role. |
| `typescript/` SDK | 9 files, **0 tests** | full client surface | See SHOULD-FIX-3: all empty stubs, not a config bug. |

Five highest blast-radius untested behaviors (by consequence if broken, not by count):
1. **`InMemoryCredentialVault.getCredential`** (`execution-control/src/CredentialVault.ts`): no test isolates credential storage/lookup from the rest of the 11-test suite; a broken credential scoping check here is the exact failure mode the whole credential-brokering roadmap item exists to prevent. Proposed test: two connectors register credentials, assert one connector's lookup can never return another's.
2. **`AuthorizationVerifier`/`EnvelopeVerifier` cross-package integration**: MUST-FIX-1 shows the package-boundary behavior is untested by anything except the two now-failing gateway tests. Proposed test: a CI step that runs `execution-gateway`'s suite against a freshly-built `dist/` (or against source) on every run, not just opportunistically.
3. **`ReceiptBuilder`/`ReceiptEngine`**: zero tests on the artifact CLAIMS.md 2.5 cites as one of three pillars of "verifiable execution evidence." Proposed test: build a receipt from a known trust record, assert its hash is stable and its signature verifies.
4. **`StorageFactory.createFromEnvironment()`**: MUST-FIX-3's silent-fallback-to-memory has no test asserting the env-var-to-provider mapping at all. Proposed test: set the env var, assert the correct provider class is returned (would have caught the naming mismatch immediately).
5. **`FilePolicyRepository` construction path in `application.ts`**: no test exercises import-time behavior with `PARMANA_POLICY_DIR` unset (MUST-FIX-4). Proposed test: a process-spawn test that imports `application.ts` with the var deliberately unset and asserts a named, catchable error rather than an unhandled crash.

### Lens 6: Fresh-clone and runtime correctness
- `PARMANA_POLICY_DIR`, Supabase construction-at-import: see MUST-FIX-4, MUST-FIX-3.
- `SUPABASE_URL!`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY!` in
  `SupabaseClientFactory.create()` (`packages/storage/src/supabase/SupabaseClientFactory.ts:5-8`)
  are non-null-asserted with no fallback, same pattern as `PARMANA_POLICY_DIR`, would throw
  plainly if `PARMANA_STORAGE=supabase` were ever actually set without these.
- `dist/` directories are gitignored tree-wide (confirmed for `crypto`/`envelope-verifier`;
  pattern is `dist/` in `.gitignore:88`), a genuinely fresh clone has **no** `dist/` at
  all, so `@parmana/*` cross-package imports fail outright until `npm run build` runs.
  README's documented sequence (`npm install` → `npm run build` → `npm test`, `README.md:
  791-815`) covers this correctly; the danger is purely that nothing *re-runs* the build
  step after a source edit, which is exactly how MUST-FIX-1's staleness happened on this
  machine.
- `examples/04-verified-execution/` exists with a `README.md`, `run.ts`, `transaction.json`
  (no separate `package.json`, runs via the root `examples` workspace and
  `scripts/run-examples.ts`); not executed this session due to time budget; structure
  confirmed by reading, not by running.
- README-documented commands (`npm install`, `npm run build`, `npm test`, `npm run dev`,
  `npm run examples`) all have matching root `package.json` scripts; no drift found here.

### Lens 7: Cross-tree consistency
- `python/scripts/generate_models.ts --check` (run via `node --experimental-strip-types`,
  the plain `tsx` CLI mis-resolved the path in this environment for unrelated reasons)
  reports `python/parmana/models/*.py are up to date`; generator-covered files are in
  sync. Manual spot check of `business_transaction.py` against
  `packages/shared/src/domain/business-transaction.ts`/`metadata.ts` shows matching field
  sets and types (frozen dataclass, optional fields correctly nullable). A second model was
  not independently spot-checked this session beyond noting `override.py` exists in the
  generated set; the Python SDK ships bindings for the Override type even though nothing
  can reach it via any route (consistent with, not contradicting, the OverrideService
  guard).
- `docs/site/cryptography/overview.mdx` sampled: accurate and appropriately hedged,
  explicitly flags ECDSA P-256 as "declared in the enum, no provider class confirmed,"
  which this session independently confirmed (zero hits for ECDSA/P-256/prime256v1 in
  `packages/crypto/src`). No stale precondition/payload-v2 references found in any sampled
  `docs/site/**` page.
- Root docs vs. reality: `02-REMAINING.md`'s Tier 0 guard entry (added this session,
  uncommitted, see prior conversation turn) about Override machinery is accurate and
  current. The `04-INCIDENTS-LOG.md` "Minor / dead-code findings" section is accurate
  against this session's independent re-verification (§4). No entries found that describe
  since-reverted work as still pending, beyond the payload-version nuance MUST-FIX-1
  surfaces (which the roadmap could not have anticipated, since it's a build-artifact
  staleness bug, not a source-level gap).

---

## 6. Claims scorecard (Lens 1)

| # | Claim (docs/CLAIMS.md §2/§3) | Verdict | Code | Test |
|---|---|---|---|---|
| 2.1 | Trusted Business Transactions validated pre-runtime | HOLDS | `packages/runtime/src/validators/BusinessTransactionValidator.ts` | present in `packages/api` integration suite |
| 2.2 | Deterministic policy selection, no discovery/negotiation | HOLDS | `packages/runtime/src/policy/PolicyRouter.ts`, `PolicyValidator.ts` | `packages/runtime/tests/PolicyRouter.test.ts` |
| 2.3 | Deterministic sequential policy evaluation | HOLDS | `packages/policy/src/PolicyEngine.ts` | `packages/policy/test/PolicyEngine.test.ts` + 4 sibling files (61 tests total in package) |
| 2.4 | Authorized execution / trust-artifact gating | HOLDS | `packages/runtime/src/components/TrustChainValidationComponent.ts`, `RuntimeEngine.ts` | `packages/runtime` suite (31 tests) |
| 2.5 | Verifiable execution evidence (records/hashes/receipts) | **HOLDS-UNTESTED** for the receipt half | `ExecutionTrustRecordBuilder.ts`, `VerificationCrypto.ts`, `ReceiptCrypto.ts` all exist | Trust record hashing is tested; `packages/receipt` (`ReceiptBuilder`/`ReceiptEngine`) has **zero** test files (§ Lens 5) |
| 2.6 | Independent verification of evidence | HOLDS | `packages/runtime/src/services/verification-service.ts` | `packages/runtime/test/verification-service.test.ts` |
| 2.7 | Replay support | HOLDS-UNTESTED at the live route | `packages/replay` (5 test files, 9 tests, package-internal) | Confirmed orphaned from the live `/replay` route (§4); the package is tested, the *integration* isn't |
| 2.8 | Signed, single-use, time-bounded authorization | **OVERCLAIMS at the package boundary** | `AuthorizationSigner`/`AuthorizationVerifier`/`EnvelopeVerifier`/`MemoryNonceStore` all exist and are individually correct | `packages/crypto/test/authorization-envelope.test.ts`, `packages/envelope-verifier/test/envelope-verifier.test.ts` both pass, but only because they import `../src` directly; the cross-package path (`execution-gateway`) demonstrably fails this exact property today (MUST-FIX-1) |
| 2.9 | Independent envelope verification | HOLDS | `@parmana/envelope-verifier` | same caveat as 2.8 applies to any consumer of the published package, not the claim's own package-internal tests |
| 2.10 | Rejection of forged/tampered/expired/replayed | **OVERCLAIMS at the package boundary** | see 2.8 | `envelope-verifier.test.ts` doesn't include a version-tamper case at all; the version-tamper case that *does* exist (`execution-gateway`'s) is the one currently failing |
| 2.11 | Trust record bound to its authorization | HOLDS | `ExecutionTrustRecordBuilder` | `execution-authorization-wiring.test.ts`: "trust record references the authorization" |
| 2.12 | Fail-closed authorization on rejection | HOLDS | `RuntimeEngine` (signs only post-`executionGate.enforce()`) | `execution-authorization-wiring.test.ts`: "rejected transaction produces no authorization" |
| 2.13 | Key/algorithm binding guard | HOLDS | `assertKeyType` (`packages/crypto/src/providers/signature/assertKeyType.ts`) | `packages/crypto/test/SignatureProvider.test.ts` |
| 2.14 | Configurable ML-DSA-65 signing | HOLDS | `Dilithium3SignatureProvider`, `FileKeyProvider` | `Dilithium3SignatureProvider.test.ts`, `dilithium3-cross-instance.test.ts` |
| 2.15 | Authorization-binding verification, independent checks | HOLDS | `VerificationService` | `verification-service.test.ts` (6 cases) + `verification-negative.integration.test.ts` |
| 3.1 | Non-bypassable envelope verification (scoped) | HOLDS as scoped, but see MUST-FIX-2 for an adjacent unscoped gap (API auth) that the claim's own scope clause doesn't cover | n/a | n/a |
| 3.2 | Fleet-wide single-use requires shared NonceStore | HOLDS | `MemoryNonceStore` | documented in its own doc comment, matches CLAIMS.md verbatim |
| §4 Future | "AI never possesses execution credentials", withheld | Correctly withheld | `execution-control`'s `InMemoryCredentialVault` is explicitly an in-memory scaffold (matches `02-REMAINING.md`'s own [PARTIAL] status) | thin coverage, see Lens 5 |
| §4 Future | KMS/HSM custody, withheld | Correctly withheld | `KeyProviders` enum declares `aws-kms`/`azure-key-vault`/`gcp-kms`/`hsm` with no implementing class (confirmed, matches `docs/site/cryptography/overview.mdx`'s own caveat) | n/a |

**STALE check result:** no surviving `PreconditionResolver`/`preconditionsHold`/payload-v2
references in any `.md` doc, `docs/site/**` page, or code comment outside the stale `dist/`
build artifacts themselves and their `.d.ts`/`.map` files. The revert is textually complete;
only the compiled output lagged.

---

## 7. What is genuinely solid

- **`CanonicalSerializer`** (`packages/crypto/src/CanonicalSerializer.ts`): single-sourced,
  recursively deterministic, `Date`-safe. No second serialization path found for any
  signed/hashed domain artifact.
- **`AuthorizationVerifier`/`EnvelopeVerifier` source** (not the stale build): correct
  fail-closed version check, no early-return timing oracle between signature and expiry
  checks (the doc comments' stated invariant matches the code exactly).
- **`assertKeyType` key/algorithm binding guard**: does exactly what CLAIMS.md 2.13
  says, cleanly tested.
- **`MemoryNonceStore`**: its own doc comment is more honest than most production code's
  README, and matches CLAIMS.md 3.2 word for word.
- **API error handler**: no stack-trace leakage under any tested failure path; consistent
  400/404/409/500 mapping by error type.
- **`toExecutableContent`**: a genuine single point of field-list truth, correctly used by
  both current call sites (modulo SHOULD-FIX-1's second, parallel manual list).
- **`docs/site/cryptography/overview.mdx`**: the one docs/site page sampled in depth this
  session volunteers its own gaps (ECDSA P-256, KMS) rather than glossing over them; this
  session's independent verification confirmed both flagged gaps are real.
- **`python/parmana/models/*.py` generation**: the `--check` generator agrees the
  generated files are current; the one manually spot-checked model matches its TypeScript
  source field-for-field.
- **`04-INCIDENTS-LOG.md`**: every "still open" and "minor/dead-code" item in it was
  independently re-verified this session and found accurate, with one exception
  (Supabase-throws-at-import) that turned out to be masked by a second, previously
  undocumented bug (MUST-FIX-3) rather than fixed.

---

## 8. Recommended sequence

Respecting the existing roadmap tiers and the house rule that schema-adjacent changes are
always dedicated sessions:

1. **Immediate, ride together (micro-edit):** rebuild `dist/` for `crypto` and
   `envelope-verifier` (MUST-FIX-1's immediate fix) + fix the `PARMANA_STORAGE`/
   `DATABASE_PROVIDER` env-var mismatch (MUST-FIX-3): both are "stop doing the wrong
   thing right now" fixes with no design surface, safe to bundle.
2. **Tier 0, dedicated micro-session:** `PARMANA_POLICY_DIR` repo-relative fallback
   (MUST-FIX-4), already scoped this way in `02-REMAINING.md`; do not bundle with #1
   since it touches config-loading order, not just a stale artifact.
3. **Tier 0/1, dedicated micro-session:** prevent MUST-FIX-1 from recurring: either a
   pretest build step for workspace deps or a CI check that fails on a `dist/` older than
   its `src/`. This is process/tooling, not a source fix, and deserves its own session
   because the design choice (rebuild-always vs. source-resolution vs. staleness-detection)
   has real trade-offs worth discussing, not just implementing.
4. **Dedicated session:** API authentication (MUST-FIX-2): touches every route, needs a
   credential/rotation design; never a rider on something else.
5. **Ride with the next natural runtime touch (micro-edit):** `ExecutionRequestBuilder`
   calling `toExecutableContent()` (SHOULD-FIX-1); `ExecutionEvidenceComponent` dead-code
   decision (SHOULD-FIX-4); `docs/CLAIMS.md` de-escaping (SHOULD-FIX-2, doc-only).
6. **Session-sized, independent:** `typescript/` SDK real test coverage (SHOULD-FIX-3);
   `receipt` package test coverage (Lens 5 finding #3); `execution-control` credential-path
   test isolation (Lens 5 finding #1). These can be sequenced in any order relative to each
   other but should each be their own session given the surface area.
