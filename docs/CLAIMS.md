# Parmana Technical Claims



Version: 1.0



Status: Public



---



# Key Compromise Notice



The default signing key (`keys/default.private.pem` / `keys/default.public.pem`) was publicly exposed in a Parmana Systems GitHub repository prior to 2026-07-05 (incident record: `04-INCIDENTS-LOG.md`, INC-1). This repository's own commit history does not carry that exposure (no `.pem` private key was ever committed here), but the key itself must still be treated as permanently compromised regardless of which repository exposed it.



All signatures produced by that key are void for authenticity purposes, regardless of when the signed artifact was created.



The key pair was rotated on 2026-07-05.



---



> Building a new connector? Read [CONNECTOR-BUILD-GUIDE.md](./CONNECTOR-BUILD-GUIDE.md) first — it captures the pattern distilled from the Razorpay and HubSpot connectors (credential guards, bound-signals hardening, test order, non-destructive live tests).



---



# 1. Core Positioning



## Category



Parmana is **Execution Trust Infrastructure**.



## Mission



Trust in what an AI agent did should not have to rest on hoping it behaved. It should be a verifiable record. Parmana establishes that record through an explicit chain: authorize, verify, execute, confirm, connecting business authorization, policy evaluation, runtime execution, and execution evidence.



## Value Proposition



Parmana enables organizations to verify what automated systems executed, not simply trust that they executed correctly.



---



# Purpose



This document defines the public technical claims that Parmana makes about its architecture and capabilities: the authorize → verify → execute → confirm chain above, made specific and checkable.



Claims are categorized according to the level of implementation evidence available.



A technical claim SHOULD be promoted only when supported by:



* implementation

* automated tests

* audit evidence

* documented proofs

* independent verification (where applicable)



---



# 2. Supported Technical Claims



The following claims are supported by the current implementation and architecture.



---



## 2.1 Trusted Business Transactions



Parmana validates Business Transactions before execution.



Business Transactions are checked for internal trust-chain consistency before entering the runtime.



Evidence



* BusinessTransactionValidator

* G-01 Trusted Business Transaction



---



## 2.2 Deterministic Policy Selection



Parmana executes exactly one explicitly referenced business policy.



The runtime loads the policy identified by the Business Transaction and validates its identity before evaluation.



The runtime does not:



* discover policies

* negotiate policies

* automatically select the latest version

* substitute alternative policies



Evidence



* PolicyRouter

* PolicyValidator

* G-02 Deterministic Policy Selection



---



## 2.3 Deterministic Policy Evaluation



Parmana deterministically evaluates business policies using sequential rule evaluation with first-match semantics.



Evaluation records include:



* matched rule

* decision reason

* evaluation trace



Evidence



* PolicyEngine

* G-03 Deterministic Policy Evaluation



---



## 2.4 Authorized Execution



Parmana prevents execution when required trust artifacts are missing or when the decision outcome is not approved.



Evidence



* TrustChainValidationComponent

* RuntimeEngine

* G-04 Authorized Execution



---



## 2.5 Verifiable Execution Evidence



Parmana generates cryptographically verifiable execution evidence.



Execution produces:



* Execution Trust Records

* Canonical Trust Record hashes

* Signed Receipts



Evidence



* BusinessTrustRecordBuilder (renamed from ExecutionTrustRecordBuilder)

* ExecutionComponent, ExecutionEvidenceBuilder (packages/runtime/src/{components/ExecutionComponent,ExecutionEvidenceBuilder}.ts) — the live pipeline stage that builds and attaches ExecutionEvidence to every Execution, called by RuntimeFactory-constructed Runtimes; not to be confused with ExecutionEvidenceComponent, a same-named-in-spirit stub confirmed unwired and deleted (docs/VERIFICATION-GAPS.md G-26)

* ReceiptService (packages/runtime/src/services/receipt-service.ts), called directly by ExecutionTrustApplication.execute() on every successful execution

* VerificationCrypto

* ReceiptCrypto

* packages/runtime/tests/integration/receipt.integration.test.ts, receipt-hybrid.integration.test.ts

* G-05

* G-06



---



## 2.6 Independent Verification



Parmana supports independent verification of execution evidence.



Verification can confirm execution integrity using the generated execution artifacts.



Evidence



* packages/runtime/src/services/verification-service.ts

* packages/runtime/test/verification-service.test.ts

* VerificationCrypto

* G-07



---



## 2.7 Replay Support



Parmana supports replay of recorded execution decisions for verification and analysis, via the standalone `@parmana/replay` package (`ReplayEngine`), which re-evaluates a recorded policy decision against its recorded signals and reports whether the outcome matches.

**Scope note (independently verified, Phase 2G):** this is a package-level capability, not yet wired into the HTTP API. `POST /replay` exists and returns 200, but its actual implementation (`ExecutionTrustApplication.replay()`) performs a signature/hash recheck of the stored Trust Record — the same category of check as `/verify` — not a call into `@parmana/replay`. Both behaviors are real and tested; they are simply two different things sharing the word "replay." See `docs/site/replay/overview.mdx` for the full disambiguation and `docs/architecture/phase2g-replay-semantics.md` for the independent verification, call graphs, and regression tests establishing this as the current, intentional, and separately production-contracted (both SDKs are typed against `POST /replay`'s current response shape) behavior — not an unwired bug awaiting a fix.

Evidence

* Replay package (packages/replay/src/ReplayEngine.ts)

* G-08

* docs/architecture/phase2g-replay-semantics.md



---



## 2.8 Signed, Single-Use, Time-Bounded Execution Authorization



Every approved execution request carries a cryptographically signed Execution Authorization scoped to one decision, bound to a single-use nonce, and valid only within a bounded time window (Ed25519 by default; ML-DSA-65 / FIPS 204 configurable via SIGNATURE_PROVIDER).



Evidence



* AuthorizationSigner

* AuthorizationVerifier

* EnvelopeVerifier

* MemoryNonceStore

* packages/crypto/test/authorization-envelope.test.ts

* packages/envelope-verifier/test/envelope-verifier.test.ts



---



## 2.9 Independent Envelope Verification



A receiving system can independently verify that Parmana authorized an execution request without trusting Parmana's runtime process or its database. Verification requires only Parmana's public key and the envelope itself.



Evidence



* @parmana/envelope-verifier (EnvelopeVerifier, requireParmanaAuthorization)

* packages/envelope-verifier/README.md ("Claims" section)



---



## 2.10 Rejection of Forged, Tampered, Expired, and Replayed Authorizations



The receiving system rejects a forged signature, a tampered payload, an expired envelope, and a replayed (previously accepted) envelope. Replay protection is scoped to whichever NonceStore instance performs the check; see 3.2 below.



Evidence



* packages/envelope-verifier/tests/unit/envelope-verifier.test.ts: "a forged envelope does not burn the nonce", "an expired envelope does not burn the nonce", "rejects a second use of the same nonce", "treats the exact expiresAt instant as expired (boundary is exclusive, not inclusive)", "under two concurrent verify() calls with one nonce, exactly one succeeds (deterministic, not flaky)"



---



## 2.11 Trust Record Bound to Its Authorization



The Execution Trust Record's authorizationId is part of the canonical content that is hashed and signed, not merely attached alongside it. Tampering with it changes the recomputed Trust Record hash.



Evidence



* BusinessTrustRecordBuilder (renamed from ExecutionTrustRecordBuilder)

* packages/runtime/test/execution-authorization-wiring.test.ts: "trust record references the authorization"



---



## 2.12 Fail-Closed Authorization on Rejection



A rejected Decision never produces a Signed Execution Authorization.



Evidence



* RuntimeEngine (authorization signing occurs only after executionGate.enforce() approves the Decision)

* packages/runtime/test/execution-authorization-wiring.test.ts: "rejected transaction produces no authorization"



---



## 2.13 Key/Algorithm Binding Guard



Signing or verifying with key material of the wrong type (for example, an Ed25519 key against the configured ML-DSA-65 provider, or vice versa) fails closed with a clear error naming both the expected and actual key type, rather than silently dispatching on the key's own type.



Evidence



* assertKeyType (used by Ed25519SignatureProvider and Dilithium3SignatureProvider)

* packages/crypto/test/SignatureProvider.test.ts



---



## 2.14 Configurable Post-Quantum Signing (ML-DSA-65)



Post-quantum signing (ML-DSA-65, FIPS 204, historically referred to in this codebase as "dilithium3") is selectable via SIGNATURE_PROVIDER, using the same PEM-based persistent key mechanism as the default Ed25519 provider (FileKeyProvider, keyId "default"). Requires Node >= 24 for native node:crypto ml-dsa-65 support. Selecting it with missing or mismatched key material fails closed rather than silently regenerating or substituting different keys.



Evidence



* Dilithium3SignatureProvider

* FileKeyProvider

* generate-keypair.ts (--algorithm dilithium3)

* packages/crypto/test/Dilithium3SignatureProvider.test.ts

* packages/crypto/test/dilithium3-cross-instance.test.ts



---



## 2.15 Authorization-Binding Verification



Every APPROVED execution in a verified Execution Trust Record must carry a non-empty authorizationId in its metadata; absence fails verification and names the execution. REJECTED-decision executions are not required to carry one. All checks (integrity, signature, authorization binding) run unconditionally and independently: a single failure never suppresses reporting of the others.



Evidence



* VerificationService (packages/runtime/src/services/verification-service.ts)

* packages/runtime/tests/unit/verification-service.test.ts: all 6 cases

* packages/runtime/tests/unit/verification-negative.test.ts: always-running, in-memory: fails on a mutated transaction payload field, a mutated signature value, and a mutated executions hash-chain-array element

* packages/api/tests/integration/verification-negative.integration.test.ts: "reports FAILED when the persisted record is tampered after execution" (additional citation; Supabase-gated, does not run without live credentials)



---



## 2.16 Caller Authentication at the API Boundary



Every route except `/health`, `/ready`, `/openapi.yaml`, `/documentation`, `POST /refusal/verify`, and `POST /audit/verify` requires a valid caller credential (`packages/api/src/app.ts`). The first four are liveness/readiness probes and API documentation; the last two are deliberately unauthenticated, independently third-party-verifiable signature-verification capabilities (RFC-0021 Refusal Record verification and caller-audit/webhook-audit signature verification, see 3.11), not routes that expose any caller's data. createApp's callerAuth option is mandatory: it accepts either an authenticator/auditSink pair or the literal string "disabled", so every call site states its choice explicitly; there is no default that silently mounts the API with no caller authentication. Production (server.ts) refuses to start with PARMANA_AUTH_DISABLED unset and no PARMANA_API_KEYS configured (2.17). A key valid for one caller does not grant a different caller's identity, and every accept/reject outcome is audited without ever recording the raw key. In production, that audit trail is durable (see 3.2's sibling claim for the NonceStore side of the same fix), backed by Supabase and shared across every process, not scoped to one process's uptime; `createCallerAuditSink.ts` fails closed at startup if Supabase is not configured. `InMemoryCallerAuditSink` remains available and correct for tests (NODE_ENV=test).

**Precise scope of `PARMANA_AUTH_DISABLED=true` (docs/VERIFICATION-GAPS.md G-28):** this flag, when explicitly opted into, removes *caller identity and accountability only* — `RuntimeEngine`, `PolicyEngine`, `CapabilityPolicyBinder`, `SignalIntentBinder`, and every `SignalStateVerifier` never read the caller-auth middleware's output at all (confirmed by direct grep: zero references to caller identity anywhere in those files), so *action-level authorization* (whether a specific `razorpay:refund-create`/`hubspot:deal-update` request is itself authorized) remains fully enforced regardless of this flag. It does not disable the authorization boundary this document's other claims describe; it disables knowing who asked.



Evidence



* packages/api/src/app.ts (CallerAuthOption: "disabled" | { authenticator, auditSink }, required, no default)

* packages/api/src/bootstrap/createCallerAuthenticator.ts

* packages/api/src/bootstrap/createCallerAuditSink.ts (production wiring; fails closed when Supabase is not configured)

* packages/api/src/auth/StaticKeyAuthenticator.ts

* packages/api/src/auth/SupabaseCallerAuditSink.ts / InMemoryCallerAuditSink.ts

* packages/api/tests/integration/supabase-caller-audit-sink.integration.test.ts: a recorded event is read back through a second, independent client

* packages/api/tests/integration/caller-auth.integration.test.ts (valid/missing/invalid credential, scoping and revocation, audit trail content never contains the raw key, composition with policy evaluation, full route inventory)

* packages/api/tests/unit/bootstrap/create-caller-authenticator.test.ts



---



## 2.17 Fail-Closed Startup Configuration Validation



Parmana refuses to start rather than let missing required configuration surface later as an unstructured runtime error. This applies to caller authentication keys (PARMANA_API_KEYS, unless PARMANA_AUTH_DISABLED=true is set explicitly), the policy directory (PARMANA_POLICY_DIR), and, in production wiring, the durable NonceStore and CallerAuditSink's Supabase configuration alike: all fail at startup with an error naming the missing variable, rather than PARMANA_POLICY_DIR surfacing as an unhandled ERR_INVALID_ARG_TYPE inside FilePolicyRepository.load at request time, or a NonceStore/CallerAuditSink silently degrading to an in-memory implementation.



Evidence



* packages/api/src/bootstrap/createCallerAuthenticator.ts

* packages/shared/src/config/Config.ts (requirePolicyDirectory)

* packages/api/src/bootstrap/assertSupabaseConfigured.ts, used by createNonceStore.ts and createCallerAuditSink.ts

* packages/shared/tests/unit/config.test.ts: "refuses to start when PARMANA_POLICY_DIR is unset", "refuses to start when PARMANA_POLICY_DIR is blank"

* packages/api/tests/unit/bootstrap/create-caller-authenticator.test.ts

* packages/api/tests/unit/bootstrap/create-nonce-store.test.ts, create-caller-audit-sink.test.ts: "fails closed with a named, actionable error when NODE_ENV is not test and Supabase is not configured", "never silently falls back" to the in-memory implementation



---



## 2.18 Key Provider Input Validation



FileKeyProvider rejects any keyId that does not match ^[A-Za-z0-9._-]+$ before constructing a filesystem path from it, closing the path-traversal surface a crafted keyId (for example, containing "../") would otherwise open against the configured key directory.



Evidence



* packages/crypto/src/providers/key/FileKeyProvider.ts (assertValidKeyId)

* packages/crypto/tests/unit/file-key-provider.test.ts: rejects a path-traversal keyId in getPrivateKey, getPublicKey, hasKey, and getMetadata



---



## 2.19 Fail-Closed Caller-Authentication Audit Writes



A caller-authentication event (accepted or rejected) that fails to be recorded fails the request. `middleware/caller-auth.ts` wraps every `CallerAuditSink.record()` call: on success the request proceeds exactly as before; on failure the request is rejected with `AuditUnavailableError` (503, code `AUDIT_UNAVAILABLE`) and a structured log entry naming the failure, rather than proceeding unaudited or crashing as an unhandled rejection. This is a deliberate design decision (an action that executes without an audit record contradicts independently verifiable execution), not an incidental side effect; the availability cost is accepted. No retry, buffering, or queueing exists: a failure fails closed immediately, once, every time.



Evidence



* packages/api/src/middleware/caller-auth.ts (recordOrFailClosed)

* packages/api/src/auth/AuditUnavailableError.ts

* packages/api/tests/unit/middleware/caller-auth.test.ts: both success paths unchanged; both failure paths rejected with `AuditUnavailableError` (503/AUDIT_UNAVAILABLE), not a 401 and not a silent pass-through; the structured log entry's exact shape; the sink is called exactly once (no retry)

* packages/api/tests/unit/supabase-caller-audit-sink.test.ts: `SupabaseCallerAuditSink` propagates storage errors rather than swallowing them, which is what makes this guard reachable in production wiring



---



## 2.20 Atomic Rejection of Duplicate Business Transactions



Creating a Business Transaction with a `businessTransactionId` that already exists is rejected atomically, with the identical `DuplicateBusinessTransactionError` regardless of storage backend. `MemoryBusinessTransactionRepository.create()` performs its existence check and its write in the same synchronous tick, with no `await` between them, so two concurrent calls for the same id cannot interleave; `SupabaseBusinessTransactionRepository.create()` relies on the `business_transaction_id` column's `PRIMARY KEY` constraint and maps the resulting `23505` unique-violation to the same error class. Neither implementation ever silently overwrites an existing transaction.



Evidence



* packages/storage/src/memory/MemoryBusinessTransactionRepository.ts

* packages/storage/src/supabase/SupabaseBusinessTransactionRepository.ts (isUniqueViolation mapping)

* packages/shared/src/errors/duplicate-business-transaction-error.ts

* packages/storage/tests/unit/memory-business-transaction-repository.test.ts: two simultaneous `create()` calls with the same id and different content: exactly one succeeds, the other rejects with `DuplicateBusinessTransactionError`, and the stored record is exactly the winner's

* packages/storage/tests/unit/business-transaction-repository-duplicate-consistency.test.ts: both repository implementations throw the identical error class and message for a duplicate

* packages/storage/tests/integration/supabase-business-transaction-duplicate.integration.test.ts: the same concurrent-race proof against a real Postgres database (Supabase-gated)



---



## 2.21 Distinguishable HTTP Status for Policy Denial and Replay



A policy `REJECTED` decision surfaces as `HTTP 403` with `code: "POLICY_DENIED"`. An execution request whose authorization envelope has already been consumed, meaning every other Gateway check (version, signature, expiry, TTL policy, `businessTransactionHash`) passed and nonce consumption alone failed, surfaces as `HTTP 409` with `code: "NONCE_ALREADY_CONSUMED"`. Both are now distinguishable from a genuine, unexpected server error, which remains `HTTP 500`. Neither the authorization logic nor any underlying check changed to produce this: only the status code and response body surfaced to the caller changed. Every other Gateway verification failure (forged signature, expired envelope, tampered content) is unaffected and remains a plain, uncoded error, still surfacing as `HTTP 500`.



Scope, precisely: the `409` path is reachable today only by a receiving system calling `@parmana/execution-gateway`'s `ExecutionGateway.execute()` directly with an already-consumed authorization (the library-level guarantee this closes). It is not reachable through Parmana's own default `POST /execute` / `POST /transactions` routes, because a resubmitted `businessTransactionId` is rejected with the existing `409` `DuplicateBusinessTransactionError` (2.20) before `RuntimeEngine`, policy evaluation, or the Gateway are ever reached; the same admission-time layer that already made `docs/CLAIMS.md` 3.4's live idempotency proof.



Evidence



* packages/runtime/src/ExecutionGate.ts (`RuntimeError` thrown with `status: 403, code: "POLICY_DENIED"`)

* packages/shared/src/errors/nonce-already-consumed-error.ts (`NonceAlreadyConsumedError`, `status: 409, code: "NONCE_ALREADY_CONSUMED"`)

* packages/execution-gateway/src/ExecutionGateway.ts (`isSoleFailureNonceReplay`: throws `NonceAlreadyConsumedError` only when every check other than nonce consumption passed; any other combination of failed checks still throws the existing, unchanged, uncoded `Error`)

* packages/api/src/middleware/error-handler.ts (dedicated `NonceAlreadyConsumedError` branch; the existing `RuntimeError` branch reads `error.status`/`error.code` dynamically, unchanged)

* packages/execution-gateway/tests/unit/execution-gateway.test.ts, execution-gateway.dilithium3.test.ts: "rejects a replayed request without releasing it twice, as a distinguishable NonceAlreadyConsumedError (409)"

* packages/runtime/tests/unit/execution-authorization-wiring.test.ts: "rejected transaction produces no authorization" (asserts `status: 403`, `code: "POLICY_DENIED"`)

* packages/api/tests/integration/caller-auth.integration.test.ts: "a well-authenticated caller submitting a policy-rejected transaction is still rejected by policy" (asserts `response.status === 403`, `response.body.code === "POLICY_DENIED"`, through the real `POST /execute` route)

* packages/api/tests/integration/razorpay-refund.integration.test.ts, razorpay-live.integration.test.ts: the same `403`/`POLICY_DENIED` assertion for a Razorpay-refund-specific policy denial through the real production bootstrap chain

* typescript/src/transport/mapHttpErrorResponse.ts, typescript/test/Errors.test.ts, typescript/test/HttpTransport.test.ts: the TypeScript SDK maps `code: "POLICY_DENIED"` to `ExecutionRejectedError`, checked ahead of the generic `403` → `AuthorizationError` mapping so it does not collide with the unrelated caller-identity-mismatch `403` (`packages/api/src/routes/execute.ts`), which carries no `code` at all



---



## 2.22 Canonical Capability-to-Policy Binding (TD-22)



For every production capability, the policy that governs it is fixed structurally, not selected by the caller. `CapabilityPolicyBinder` checks a request's declared `Intent.action` against `CANONICAL_CAPABILITY_POLICY_BINDINGS`, a single hardcoded map from capability to the one policy reference that authorizes it (`packages/policy/src/CapabilityPolicyBinding.ts`) — covering every capability the production connector registry actually registers. A request pairing a real capability with any policy other than its canonical one is rejected as an ordinary policy denial, with zero rules evaluated, before `PolicyEngine.evaluate` ever runs.



This closes the gap that would otherwise exist because policy *loading* (`FilePolicyRepository.load(name, version)`) is itself keyed by whatever `policy.name`/`policy.version` the caller declares — validated only against a path-traversal allowlist, not against the capability being executed. Without the binder, a caller could pair a real, fund-moving or record-mutating capability (e.g. `razorpay:refund-create`) with an unrelated, unprotected policy that has no `boundSignals` for it, and have the real `intent.parameters` executed under that looser policy's rules — bypassing the capability's own protections entirely, not merely weakening them. `CapabilityPolicyBinder` is unconditionally instantiated inside `RuntimeBuilder.build()` — not configuration, not omittable from production wiring — and runs before both `SignalIntentBinder` and `PolicyEngine.evaluate`, so a wrongly-paired policy is loaded but never evaluated.



Evidence



* packages/policy/src/CapabilityPolicyBinding.ts (`CANONICAL_CAPABILITY_POLICY_BINDINGS`, `CapabilityPolicyBinder`)

* packages/runtime/src/RuntimeBuilder.ts (unconditional construction, no configuration flag)

* packages/runtime/src/RuntimeEngine.ts (binder check ordered before `SignalIntentBinder`/`PolicyEngine.evaluate`)

* packages/policy/tests/unit/CapabilityPolicyBinder.test.ts (proves the exact live-shaped exploit — `razorpay:refund-create` paired with the unrelated, unprotected `customer-refund/1.0.0` policy; `hubspot:deal-update` paired with `vendor-payment` — is rejected; also proves every production-registered capability has a binding)

* docs/architecture/phase3d-independent-authorization-certification.md §5.1 (independent re-verification, Phase 3D)



---



## 2.23 Independently Certified Authorization (Phase 3D)



*"Even if AI has valid credentials, it still cannot execute anything your business hasn't authorized. No exceptions"* — the specific claim tracked and re-verified across `docs/architecture/phase2k-capability-policy-binding.md`, `phase2l-authorization-exceptions.md` (which found it **not fully supported**, naming two exceptions: Razorpay's caller-declared daily cumulative total, and HubSpot's caller-declared `preAuthorizedForAmountChange`) — was independently re-certified from current repository state in `docs/architecture/phase3d-independent-authorization-certification.md`, treating every prior phase's conclusion as a claim to re-verify, not inherit.



**Result: CLAIM FULLY CERTIFIED** for both capabilities actually reachable in production (`razorpay:refund-create`, `hubspot:deal-update`). Both of Phase 2L's named exceptions are independently confirmed closed at the mechanism level (2.4/3.4/3.10's own TD-23 updates), credential isolation, structural capability-to-policy binding (2.22, TD-22), replay resistance, concurrency safety, and auditability were each independently re-traced from source, and no repository evidence was found that materially contradicts the claim for either in-scope capability.



Two narrow, genuinely fixable gaps the certification disclosed were closed in the same follow-up session, not merely noted: a truncated-credential-fragment leak into the caller-visible response (3.4/3.10's `keyIdRedacted`/`bearerRedacted` now return a one-way SHA-256 fingerprint, never a literal credential substring — see 3.4/3.10's own updates below) and a missing live-database concurrency proof for the Razorpay daily-refund-cap ledger (`packages/storage/tests/integration/supabase-razorpay-daily-refund-ledger.integration.test.ts`, new). **`payments:execute`/vendor-payment, originally carried forward here as a sixth disclosed limitation (a capability that would have failed this claim entirely if ever made production-reachable), was removed from the repository outright** rather than independently verified — it was never on the roadmap as a real capability; see `docs/VERIFICATION-GAPS.md` G-27 for the full account, including what was deliberately retained (the policy file and shared test fixtures that use it as generic example data, which carry no execution risk with zero connector able to back them). Five further disclosed limitations remain carried forward explicitly, each with a stated reason it was not force-closed: HubSpot's approval-issuer registry has never yet been exercised against a real operator-provisioned key; the internal Gateway attestation relies on an upstream nonce check rather than its own independent TTL; the internal gateway-session/credential-vault layer is single-process scoped; `OverrideService`'s continued, deliberate unreachability; and hybrid/PQ signing's scope stopping short of execution-authorization/Gateway/connector signing (most decisively for `OverrideService`, where `02-REMAINING.md`'s own standing security guard says not to wire it up). None of the five carried-forward items provide a currently exploitable path to unauthorized execution — full detail, with exact certification section references for each, in `docs/VERIFICATION-GAPS.md`'s "Gaps closed in the Phase 3D certification session".



Evidence



* docs/architecture/phase3d-independent-authorization-certification.md (full methodology, per-property verification, adversarial assessment, evidence summary)

* packages/connector-sdk/src/connectors/razorpay/RazorpayTypes.ts (`redactRazorpayKeyId`, fingerprint-based)

* packages/connector-hubspot/src/HubSpotTypes.ts (`redactHubSpotToken`, fingerprint-based)

* packages/storage/tests/integration/supabase-razorpay-daily-refund-ledger.integration.test.ts



---



## 2.24 Authorization Is Caller-Type-Agnostic



The authorization pipeline's outcome depends only on the requested action, the governing policy, and the independently-verified facts bearing on it — never on what kind of system, model, or entity submitted the request. This is the source-code basis for the positioning claim that Parmana protects institutional authority against execution risk from any source (AI agents, humans, applications, automated systems, third-party systems, compromised systems), not only AI: the mechanism does not special-case any of them, including ones it has no name for.



Directly validated, not inferred from the absence of AI-specific code: `BusinessTransactionMapper.fromRequest` (`packages/api/src/mappers/BusinessTransactionMapper.ts:28`) casts the caller-declared `authority` field with no runtime validation against the `AuthorityType` enum (`USER | ROLE | SERVICE | ORGANIZATION`, `packages/shared/src/domain/authority.ts`) — an arbitrary string reaches the runtime unfiltered. `RuntimeEngine`, `PolicyEngine`, `SignalIntentBinder`, and `CapabilityPolicyBinder` contain zero references to `authority` or caller identity anywhere in their source (confirmed by direct grep across all four files). A regression test submits two transactions through the real `POST /execute` route, identical in every field except `authority.authorityType` — one declaring the conventional `"USER"`, the other declaring `"FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE"`, a value that is not a member of the enum at all — and asserts byte-identical decisions (`outcome`, `matchedRuleId`, and, for the rejection case, the exact error text) on both the APPROVE and REJECT paths.



Independently confirmed by the Strategic Positioning source-code validation audit (2026-08-09, read-only): the caller-authentication layer (`StaticKeyAuthenticator`, `packages/api/src/auth/StaticKeyAuthenticator.ts`) authenticates by opaque API-key hash comparison only, with no concept of caller category either — the same identity mechanism a human operator, a script, an AI agent, or a third-party integration would all use identically.



**Scope, precisely:** this claim covers the two production-reachable capabilities (`razorpay:refund-create`, `hubspot:deal-update`, per 2.23) and the general-purpose pipeline mechanism itself. It does not claim that a non-AI caller has actually been exercised against a live production deployment — only that the mechanism contains no code path that could distinguish one caller kind from another to begin with.



Evidence



* packages/api/tests/integration/authority-type-agnostic-execution.integration.test.ts (2 cases: identical APPROVE, identical REJECT, across a conventional and a non-enum `authorityType`)

* packages/api/src/mappers/BusinessTransactionMapper.ts (unvalidated `authority` cast)

* packages/shared/src/domain/authority.ts (`AuthorityType` enum)

* packages/api/src/auth/StaticKeyAuthenticator.ts (caller-type-agnostic authentication)

* Repo-wide grep confirming zero `authority`/caller-identity references in RuntimeEngine.ts, PolicyEngine.ts, SignalIntentBinder.ts, CapabilityPolicyBinding.ts



---



## 2.25 Strategic Positioning — Independently Validated, YES (Pass 4)



*"Only what you authorize should become real"* — the specific invariant underlying the "We Are Not in the AI Race" positioning — was independently, repeatedly source-code-validated across four passes (`docs/architecture/strategic-positioning-validation.md`, the living record). The first three passes reached **PARTIALLY SUPPORTED**: the authorization mechanism itself was fully validated for every capability actually reachable in production, but `payments:execute` (vendor-payment) existed in committed code with unverified caller-declared signals, gated only by `NODE_ENV`, not by any authorization-strength property — a capability that would have violated the claim had it ever been enabled as it then existed.



**The fourth pass, run fresh with no reliance on the first three passes' conclusions, upgraded the verdict to SUPPORTED BY IMPLEMENTATION — YES.** The structural change: `payments:execute` was removed from the repository entirely (`docs/VERIFICATION-GAPS.md` G-27), not gated more tightly. `createConnectorRegistry.ts` now registers exactly three connectors in production wiring — `test-fixture` (a `NODE_ENV=test`-only, unbound, no-production-implication connector introduced solely to keep shared test infrastructure executable), `razorpay`, `hubspot` — and `payments:execute` has no connector to resolve to in any environment, independently re-confirmed by a dedicated regression test asserting this across `test`, `production`, and `development` `NODE_ENV` values. The fourth pass separately, freshly re-scrutinized the replacement test-only connector itself for new bypass risk (rather than assuming it safe by association with the removal) and found none: it is fail-closed by the identical mechanism every other connector in this registry uses, and unbound from `CapabilityPolicyBinding.ts`'s governance entirely.



**Honesty constraint, carried from the fourth pass's own report, not rounded away here:** that pass re-executed only 2 of the 10 negative tests cited across this validation's history fresh (`authority-type-agnostic-execution.integration.test.ts`; `create-connector-registry.test.ts`'s new absence case) — the other 8 were cited from code paths confirmed structurally unchanged by the removal, not individually re-run in that session. Multi-tenant/cross-institution authority isolation and the direct-database-write bypass finding were explicitly left as "unchanged, not re-traced," not re-asserted clean. The YES verdict means the specific invariant is now supported without a known exception for every capability this repository currently exposes — it is not a claim that every adjacent property was re-proven from scratch in the same session. Full precision on this distinction: `docs/architecture/strategic-positioning-validation.md` §6 ("Final Answer").



Evidence



* docs/architecture/strategic-positioning-validation.md (full four-pass history, claim-by-claim matrices, execution control path, bypass analysis, negative-test evidence for each pass)

* docs/VERIFICATION-GAPS.md G-27 (the removal this upgrade rests on)

* packages/api/tests/unit/bootstrap/create-connector-registry.test.ts ("payments:execute has no connector to resolve to in any environment")

* packages/api/tests/integration/authority-type-agnostic-execution.integration.test.ts (re-run fresh in pass 4, 2/2 passing, confirming no regression)

* packages/api/src/bootstrap/createConnectorRegistry.ts, createTestFixtureConnector.ts (the exact production registration state pass 4 verified)



---



# 3. Conditional Claims



The following claims are true only under an explicitly stated scope. The scope clause is load-bearing: removing it makes the claim false.



---



## 3.1 Non-Bypassable Envelope Verification (Scoped)



For any system running the Parmana envelope verifier, execution requests not authorized by Parmana are cryptographically impossible to accept.



This claim holds only for a receiving system that (a) runs @parmana/envelope-verifier and (b) gates every execution-triggering code path behind its verification result. Parmana enforces nothing at the network level. A receiving system that does not call the verifier, or that calls it but does not act on a failing result, is not covered by this claim.



Evidence



* @parmana/envelope-verifier (EnvelopeVerifier.verify, requireParmanaAuthorization)



---



## 3.2 Fleet-Wide Single-Use Requires a Shared NonceStore



Single-use enforcement of an authorization's nonce is scoped to whichever NonceStore instance performs the check. If multiple independent receiving systems, or multiple instances of the same system, each use their own NonceStore, the same authorization can be accepted once per instance. Fleet-wide single-use requires every instance to share one persistent NonceStore that survives a process restart, not a per-process, in-memory one.



Parmana's own production gateway does this by default. `packages/api/src/bootstrap/createNonceStore.ts` wires in `SupabaseNonceStore` (`packages/storage/src/supabase/SupabaseNonceStore.ts`), a durable, Postgres-backed NonceStore shared across every process pointed at the same Supabase project, and fails closed at startup if it is not configured, rather than silently falling back to a per-process `MemoryNonceStore`. A receiving system that does not share a persistent NonceStore (whether by choice, misconfiguration, or because it is not Parmana's own gateway) still has its exposure window bounded by the envelope's short TTL, not unlimited. This is the general, deployment-agnostic version of the claim, and still the correct one for any `@parmana/envelope-verifier` integrator supplying their own NonceStore choice; `MemoryNonceStore` remains available and correct for tests.



Evidence



* NonceStore / MemoryNonceStore / SupabaseNonceStore

* packages/api/src/bootstrap/createNonceStore.ts (production wiring; fails closed when Supabase is not configured, never falls back to in-memory)

* packages/storage/tests/integration/supabase-nonce-store.integration.test.ts: "a nonce consumed through one store instance is still consumed by a fresh instance against the same backing" (the fleet-sharing / restart-survival proof) and "two simultaneous checkAndRecord calls for the same nonce: exactly one succeeds" (a real concurrent-INSERT race against Postgres, not a simulated one)

* packages/envelope-verifier/README.md ("Claims", "PRODUCTION WARNING: MemoryNonceStore")



---



## 3.3 Connector SDK Foundation (Scoped)



@parmana/connector-sdk defines a Connector authoring contract (Connector, ConnectorRequest, ConnectorResponse, ConnectorExecutionContext, ConnectorCapability, ConnectorMetadata, ConnectorVersion, ConnectorHealth, ConnectorFactory) and extends execution-control's ConnectorRegistry, CredentialVault, and ConnectorPolicy seams without modifying them. This claim covers only the foundation: two reference connectors (HttpConnector, MockConnector), a credential-provider seam (StaticCredentialProvider, EnvironmentCredentialProvider), and deterministic connector evidence attached to the existing Execution Trust Record via the existing, unmodified ExecutionEvidence.attributes path and the existing TrustRecordHasher. It does not claim any enterprise-specific connector, any cloud secret-manager integration, or any change to Phase 1's Runtime, Policy Engine, Execution Gateway, Replay, Receipt Generation, Verification, or REST API; all of which remain exactly as evidenced elsewhere in this document.



Evidence



* packages/connector-sdk/src (Connector, ConnectorRegistry, CredentialProvider, SdkConnectorExecutor, HttpConnector, MockConnector, CapabilityConnectorPolicy)

* packages/connector-sdk/tests/unit (45 tests: registry, credential-provider leak checks, HttpConnector incl. timeout/fail-closed, MockConnector, evidence hashing/redaction, end-to-end Gateway integration, Execution Trust Record hash-boundary regression)

* policies/connector-capability/1.0.0/policy.json (reference policy: ALLOW crm:read, BLOCK crm:delete, threshold-gated payments:refund, default BLOCK, no approval-workflow outcome)



---



## 3.4 Razorpay Refund Connector (Scoped)



Razorpay refunds are authorized against a deterministic policy pack (payment must exist and be captured, currency must be INR, amount must not exceed the refundable remainder, a per-refund cap, a daily cumulative cap tracked through the existing storage layer) and executed with credentials the requesting code never holds: key_id and key_secret are resolved only inside the existing session credential vault, at execution time, and destroyed immediately afterward by the existing try/finally pattern. A signed authorization and the existing, unmodified Execution Gateway pipeline (envelope verification, one-time Gateway sessions, session-credential issuance/consumption/destruction) carry every request. A repeated request for the same parmana transaction id is answered from a local outcome cache before any network call is made; independently, before every refund-create call the connector lists existing Razorpay refunds for the payment and treats one already tagged with the same transaction id as already executed, never creating a duplicate. This claim covers refund creation only. It does not claim payout creation (RazorpayX), webhooks, or live-mode operation, and it does not claim any change to Phase 1's Runtime, Policy Engine, Execution Gateway, Replay, Receipt Generation, Verification, or REST API, all of which remain exactly as evidenced elsewhere in this document.

The Razorpay connector is also registered in the production API bootstrap (`packages/api/src/bootstrap/createConnectorRegistry.ts`), reachable through the existing, unmodified `POST /execute` endpoint by capability-based routing, rather than only through unit tests and the standalone tutorial. Reached this way, policy is evaluated against caller-supplied signals, the same generic mechanism every capability-based connector in this registry uses. Credentials (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`) are resolved by a dedicated environment-backed provider at execution time only, following the same session-credential isolation as every other production connector. If either variable is unset outside test mode, the connector is not registered at all: `razorpay:payment-fetch` and `razorpay:refund-create` simply have no connector to resolve to (ConnectorSdkRegistry's existing "No connector registered for capability" error), rather than the process starting with a mock or partially-configured credential, or the whole API refusing to start over one optional connector.

**Update (execution-ownership refactor, Phase 1C):** the executable connector class described throughout this section was migrated verbatim from `@parmana/connector-sdk`'s `RazorpayConnector` to `GatewayRazorpayAdapter` (`packages/execution-gateway/src/connector-execution/GatewayRazorpayAdapter.ts`) -- same behavior, new package, per that migration's own header comment ("migrated verbatim... only the executable class moved"). `RazorpayRefundService` and `RazorpayRefundHarness` (the "separate, test/tutorial-only harness" this section previously described as carrying independent fetch-verify behavior) no longer exist anywhere in the repository; `examples/tutorials/61-razorpay-refund`, previously cited as evidence below, does not exist either. This was an undocumented drift, independently re-discovered and flagged (not yet corrected) by `docs/architecture/phase2l-authorization-exceptions.md` before this pass. Capability identifiers and DTOs (`RazorpayCapabilities.ts`, `RazorpayTypes.ts`, `RazorpayMetadata.ts`) stayed in `@parmana/connector-sdk` and are imported back into the adapter; `RazorpayRefundReceipt.ts` and `MockRazorpayServer.ts` are unchanged at their original paths.

**Update (adversarial-testing hardening session, see VERIFICATION-GAPS.md G-24):** "policy is evaluated against caller-supplied signals" above was, until this session, a materially incomplete safety picture for this reason: nothing bound those signals to the `intent.target`/`intent.parameters` the same request actually executes. A caller could declare signals describing a small, fully-verified payment while `intent` executed an arbitrary amount to an arbitrary target, and receive a signed APPROVED trust record for it, demonstrated live against both `vendor-payment/2.0.0` and, by the same mechanism, this Razorpay path. `razorpay-refund/1.0.0/policy.json` now declares `boundSignals: { "requestedRefundAmountPaise": "parameters.amountPaise" }`, enforced by `SignalIntentBinder` (`packages/policy/src/SignalIntentBinder.ts`) before `PolicyEngine.evaluate` ever runs. This closes the amount-mismatch vector for this policy.

**Update (RFC-0022 + TD-23, both now closed):** the fetch-verify behavior the previous paragraph flagged as remaining, separate, larger work is now built and wired into production. `RazorpaySignalStateVerifier` (`packages/connector-sdk/src/connectors/razorpay/RazorpaySignalStateVerifier.ts`), constructed unconditionally in `packages/api/src/bootstrap/createRazorpaySignalStateVerifier.ts`, independently re-fetches the real payment from Razorpay and compares `paymentStatus`, `paymentCurrency`, `refundableRemainingPaise`, and `requestedExceedsRemainder` against the caller-declared signals before an APPROVE decision is allowed to stand; a fetch failure is itself treated as a violation. Separately, the daily cumulative refund cap this section's opening sentence mentions -- previously a caller-declared, unverified signal ("`dailyCumulativeAfterThisRefundPaise` is not independently verified", `docs/architecture/phase2l-authorization-exceptions.md`) -- is now independently derived from `RazorpayDailyRefundLedger` (`packages/connector-sdk/src/connectors/razorpay/RazorpayDailyRefundLedger.ts`, backed in production by `SupabaseRazorpayDailyRefundLedger`, `packages/storage/src/supabase/SupabaseRazorpayDailyRefundLedger.ts`), supplied unconditionally by the same production bootstrap function -- its own comment states this is "always supplied here (never omitted)... the production wiring path is where the daily cumulative cap becomes a structural invariant rather than an optional, caller-declared signal." Full detail: `docs/VERIFICATION-GAPS.md` G-24's RFC-0022/TD-23 update paragraphs.

Reachability proof for this API-wired path is no longer MockRazorpayServer-only. `packages/api/tests/integration/razorpay-live.integration.test.ts`, gated behind `ALLOW_LIVE_RAZORPAY=1` plus a real `RAZORPAY_TEST_KEY_ID` (must start with `rzp_test_`, checked before any network call) / `RAZORPAY_TEST_KEY_SECRET` pair (mirroring `ALLOW_LIVE_SUPABASE`, skipped by default so this stays opt-in rather than a default `npm test` behavior), drives the same production bootstrap chain through a real `POST /execute` against Razorpay's actual test-mode API (`https://api.razorpay.com`). Two cases in this file target a deliberately non-existent payment id and only prove reachability (a real, distinguishable HTTP response, not a network-level failure, for `razorpay:payment-fetch` and `razorpay:refund-create`'s pre-create idempotency-listing GET), never reaching a money-moving call.

A third, independently gated case (requiring one additional variable, `TEST_RAZORPAY_CAPTURED_PAYMENT_ID`, naming a Razorpay test-mode payment captured once, manually, through client-side Checkout, since there is no server-side API to create one) goes further and has now been run live to completion. **Razorpay test mode, against a manually captured Checkout payment, 100 paise, via the production `POST /execute` chain**: a refund was created (Razorpay refund entity id observed, redacted: `***************pG6B`; amount confirmed 100 paise in both the outgoing request and Razorpay's response; `notes.parmana_txn` carrying the businessTransactionId). Idempotency was proven live, not assumed: resubmitting the identical businessTransactionId was rejected with HTTP 409 by `BusinessTransactionService.accept()`'s uniqueness guard (packages/runtime/src/services/business-transaction-service.ts), a layer upstream of the connector's own pre-create listing check (at the time of this live run, `RazorpayConnector`'s; the identical check now lives in `GatewayRazorpayAdapter` after the Phase 1C migration described above), before RuntimeEngine, policy evaluation, or the connector were ever invoked; zero calls to `api.razorpay.com` were made for the repeat. An independent, out-of-band live listing (test-side oracle, bypassing the connector) then confirmed exactly one refund exists for the payment carrying that transaction id. A third sub-case discovered the payment's real remaining refundable amount live (through a `razorpay:payment-fetch` call, not guessed), requested a refund exceeding it, and confirmed policy denial with zero calls to Razorpay. This is the first live execution of the money-moving refund-create call in this codebase's history. It does not claim live-mode (as opposed to test-mode) operation, or webhook handling (M4); both remain future work (see Future Claims).

A defense-in-depth fix accompanies this: the connector itself (at the time of this fix, `RazorpayConnector`; now `GatewayRazorpayAdapter`, `packages/execution-gateway/src/connector-execution/GatewayRazorpayAdapter.ts`, after the Phase 1C migration above) now refuses, before any network call, to send the built-in test-mode placeholder credential (createRazorpayCredentialProvider.ts's fallback when no real test-mode credential is configured) to Razorpay's real API; that placeholder is only ever safe against a mock server reached through an explicit `baseUrl` override, and this guard makes that a structural guarantee rather than an accident of Razorpay rejecting unrecognized credentials. Separately, `createRazorpayCredentialProvider.ts`'s test-mode branch now reads `RAZORPAY_TEST_KEY_ID`/`RAZORPAY_TEST_KEY_SECRET` directly (the same names documented in `.env.example`), removing a prior word-order-swapped bridge variable that depended on call sites remembering to copy one name into the other.



Evidence



* packages/execution-gateway/src/connector-execution/GatewayRazorpayAdapter.ts, createGatewayRazorpayConnector.ts (the executable connector; Basic-auth HTTP calls to Razorpay's payment-fetch/refund-create/refund-fetch endpoints)

* packages/connector-sdk/src/connectors/razorpay (RazorpayCapabilities.ts, RazorpayTypes.ts, RazorpayMetadata.ts: capability ids and DTOs, imported into the adapter above; RazorpayRefundReceipt.ts, MockRazorpayServer.ts: unchanged; RazorpaySignalStateVerifier.ts, RazorpayCapabilityExecution.ts, RazorpayDailyRefundLedger.ts/InMemoryRazorpayDailyRefundLedger.ts: the independent policy-time signal-verification side, see the RFC-0022/TD-23 update above)

* packages/execution-gateway/tests/unit/razorpay-connector.test.ts (moved from connector-sdk in the Phase 1C migration; approval and execution, denial for each policy rule, application-level idempotency with no duplicate create call, replay with no second HTTP call at all, key_secret absence from evidence/receipt/thrown errors, tamper rejection via businessTransactionHash verification)

* packages/connector-sdk/tests/unit/razorpay-refund-policy.test.ts

* policies/razorpay-refund/1.0.0/policy.json

* packages/api/src/bootstrap/createRazorpayConnector.ts (delegates to `createGatewayRazorpayConnector`), createRazorpayCredentialProvider.ts (production registration; fails closed, the connector is never registered, when `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are unset outside test mode), createRazorpaySignalStateVerifier.ts (RFC-0022/TD-23), createConnectorRegistry.ts (conditional registration), createConnectorAuthenticator.ts (razorpay added to the trusted connector identity list)

* packages/api/tests/unit/bootstrap/create-razorpay-credential-provider.test.ts, create-connector-registry.test.ts (credential present/absent/malformed cases; fail-closed capability resolution when unconfigured; razorpay fails closed outside `NODE_ENV=test`; key_secret never embedded in a thrown error). **`payments:execute`/vendor-payment's own fail-closed history is now fully historical**: TD-1/Phase 2A first made it fail closed outside `NODE_ENV=test` (previously unconditionally registered in every environment; see `docs/operations/td1-closure-summary.md` for that evidence chain), and it was later removed from the repository entirely rather than independently verified (`docs/VERIFICATION-GAPS.md` G-27) — `payments:execute` now has no connector to resolve to in any environment, confirmed by `create-connector-registry.test.ts`'s own current assertion to that effect.

* packages/api/tests/integration/razorpay-refund.integration.test.ts: a refund authorized, verified, and executed through a real `POST /execute` HTTP request against the production bootstrap chain (`createExecutionSystem`), landing on MockRazorpayServer; a policy-denied refund through the same path making zero calls to Razorpay; and (RFC-0022) "rejects by policy through POST /execute when caller-declared signals misrepresent the real Razorpay payment state"

* packages/api/tests/integration/razorpay-live.integration.test.ts: the only test in this codebase that calls a real Razorpay endpoint, gated behind `ALLOW_LIVE_RAZORPAY=1` + real test-mode credentials (skipped by default). Two cases prove reachability only, against a deliberately non-existent payment id. A third, independently gated case (additionally requiring `TEST_RAZORPAY_CAPTURED_PAYMENT_ID`) creates a real 100-paise refund against a manually captured test-mode payment through the full production `POST /execute` chain, proves idempotency live (a same-id repeat is rejected with HTTP 409 before any second Razorpay call, independently confirmed via a live refunds listing), and proves policy denial live for a refund exceeding the payment's real remaining refundable amount (zero Razorpay calls)

* packages/execution-gateway/tests/unit/razorpay-connector.test.ts: regression coverage added alongside the placeholder-credential fix above: the connector refuses to send the built-in test-mode placeholder credential to Razorpay's real API before any network call (fetch spy asserts zero calls), and confirms the same placeholder still works normally against a mock server (baseUrl override); the guard is real-endpoint-specific, not a behavior change for existing mock-based tests

* packages/connector-sdk/tests/unit/InMemoryRazorpayDailyRefundLedger.test.ts (TD-23, Phase 3B: atomic reserve-before-execute, concurrent-request race no longer over-permits)

* packages/storage/tests/integration/supabase-razorpay-daily-refund-ledger.integration.test.ts (Phase 3D certification follow-up: the same atomic-reservation proof as the line above, against the real, production `SupabaseRazorpayDailyRefundLedger` implementation and a live Postgres connection, not only the in-memory test double — closes the live-concurrency test-coverage gap the certification disclosed)

**Update (Phase 3D certification follow-up):** `redactRazorpayKeyId` (`RazorpayTypes.ts`) no longer truncates the literal `key_id` (previously: first 8 characters plus an ellipsis, still a genuine substring of the credential). It now returns a one-way, truncated SHA-256 fingerprint (`fp_` + 12 hex chars) — the same operational "which key executed this" signal, with zero credential bytes of any length ever reaching `ConnectorResponse.metadata`, the Trust Record, or the `POST /execute` response body. `razorpay-connector.test.ts`'s redaction test now asserts the response body contains no substring of `key_id` at all, not merely a differently-shaped value.

**Evidence note:** `examples/tutorials/61-razorpay-refund`, and the `RazorpayConnector`/`RazorpayRefundService`/`RazorpayRefundHarness`/`razorpay-refund-service.test.ts` citations this section previously carried, no longer exist in the repository as of the Phase 1C execution-ownership refactor; this section was updated in a documentation-verification pass (following the discipline `docs/architecture/phase2l-authorization-exceptions.md` had already flagged the drift under) to cite only what currently exists.

---



## 3.5 Razorpay Webhook Receipt (M4a, Scoped)



`POST /webhooks/razorpay` receives Razorpay webhook deliveries, verifies their signature, and durably deduplicates them by event id. This milestone stops there: a verified, fresh event is persisted to a pending-events store and acknowledged. It does not claim settlement confirmation, any Execution Trust Record lifecycle change, or a fetch-verify round trip against Razorpay; processing a persisted event is explicitly out of scope (M4b, see Future Claims below).



Signature verification is HMAC-SHA256 over the raw request body bytes against `RAZORPAY_WEBHOOK_SECRET`, compared timing-safe (`crypto.timingSafeEqual`, the same construction as `StaticKeyAuthenticator`'s API-key comparison) against the `X-Razorpay-Signature` header. The raw bytes are captured route-scoped (`express.raw()` mounted on this router only, ahead of the app's global `express.json()`), never a re-serialization of a parsed body, which is not guaranteed to reproduce the original wire bytes; `packages/api/tests/unit/webhooks/verify-razorpay-webhook-signature.test.ts` and the integration suite each include a case proving this specifically (a pretty-printed payload whose `JSON.stringify` output differs byte-for-byte from the wire form still verifies).



`RAZORPAY_WEBHOOK_SECRET` is a third Razorpay credential, isolated the same way as `RAZORPAY_KEY_ID`/`SECRET`: never logged, never placed in an error message or audit record. Fail-closed by construction, not merely by convention: `resolveRazorpayWebhookSecret.ts` returns `undefined` when unset outside test mode, and `app.ts` never mounts the route at all in that case; a request to it 404s (Express's own "no route matches" response), mirroring exactly how the Razorpay connector itself is simply absent from the registry when `RAZORPAY_KEY_ID`/`SECRET` are unset. In test mode, `RAZORPAY_TEST_WEBHOOK_SECRET` overrides a built-in placeholder secret; every call site of `createApp` must state its `razorpayWebhook` choice explicitly (`"disabled"` or a real secret+stores triple), the same no-default discipline `CallerAuthOption` already established.



Replay protection is durable and consume-exactly-once, keyed on `X-Razorpay-Event-Id`, and structurally mirrors `@parmana/envelope-verifier`'s `NonceStore`: a single atomic call (`RazorpayWebhookEventStore.recordIfUnseen`) does both the "is this a replay?" check and the persist, with no separate check-then-set; in production this is one INSERT into `razorpay_webhook_events`, whose primary key on `event_id` is the entire atomicity mechanism (identical to `consumed_nonces`/`SupabaseNonceStore`); in test mode, an in-memory `Map`. Order is enforced in code: the dedupe store is never touched until after the signature has verified and the event id header is confirmed present, the same verify-then-consume reasoning `EnvelopeVerifier` already applies to Gateway nonces, applied here to webhook event ids. A dedicated integration test (`verify-before-consume ordering`) proves this directly: a forged signature carrying a fresh event id is rejected and the dedupe store remains untouched, and a subsequent legitimately-signed request with that same event id is still accepted as fresh, not as a duplicate.



Response discipline: verified + fresh → persisted, audited (`webhook.received`), `200` immediately, with no downstream processing inline. Duplicate (already consumed) → `200` (acknowledged, never reprocessed), audited as `webhook.duplicate`. Bad signature, missing signature header, or a validly-signed request missing the event id header → `401`, audited as `webhook.rejected` with a short diagnostic reason, body never persisted anywhere. Oversized body (over the 1MB cap) → `413`.



Payload handling treats the body as untrusted input even after signature verification: only event id, event type, and payment/refund ids (when extractable from `payload.payment.entity.id`/`payload.refund.entity.id`) ever reach an audit record, never full payload contents, and never any card/customer field Razorpay's payload may include. An audit record for a request that failed signature verification carries no payload-derived fields at all; the body is never parsed before the signature is confirmed valid.



Evidence



* packages/api/src/webhooks (RazorpayWebhookEventStore, InMemoryRazorpayWebhookEventStore, SupabaseRazorpayWebhookEventStore, RazorpayWebhookAuditSink, InMemoryRazorpayWebhookAuditSink, SupabaseRazorpayWebhookAuditSink, verifyRazorpayWebhookSignature, RazorpayWebhookTypes)



* packages/api/src/routes/webhooks-razorpay.ts (the route: verify-then-consume ordering, response discipline, payload-handling rule)



* packages/api/src/bootstrap/resolveRazorpayWebhookSecret.ts, createRazorpayWebhookEventStore.ts, createRazorpayWebhookAuditSink.ts (test/production split; fail-closed at startup in production when Supabase is unconfigured, mirroring createNonceStore.ts/createCallerAuditSink.ts)



* supabase/migrations/20260718182238_add_razorpay_webhook_tables.sql (`razorpay_webhook_events`, `razorpay_webhook_audit_events`; primary-key-as-atomicity mechanism, RLS enabled, no PII)



* packages/api/tests/unit/webhooks/verify-razorpay-webhook-signature.test.ts: HMAC-SHA256 vectors (valid signature accepted, one-byte body tamper rejected, one-byte signature tamper rejected, wrong-secret rejected, non-hex header rejected without throwing), and the raw-bytes-not-re-serialized proof



* packages/api/tests/unit/webhooks/in-memory-razorpay-webhook-event-store.test.ts: fresh event recorded; replayed event id rejected as duplicate, original record not overwritten



* packages/api/tests/unit/bootstrap/resolve-razorpay-webhook-secret.test.ts: test-mode placeholder/override; production fail-closed absence and configured-secret cases



* packages/api/tests/integration/razorpay-webhook.integration.test.ts: full `POST /webhooks/razorpay` HTTP requests against the real app and an inspectable in-memory event store/audit sink: valid signature accepted and persisted; duplicate acknowledged without reprocessing; bad signature rejected with nothing persisted; missing signature header rejected; validly-signed request missing the event id header rejected; verify-before-consume ordering (forged signature + fresh event id never consumes it); raw-bytes proof at the HTTP boundary; `razorpayWebhook: "disabled"` mounts no route (404)



---



## 3.6 Razorpay Refund Lifecycle Closure (M4b, Scoped)



`RazorpaySettlementProcessor` (packages/api/src/webhooks/RazorpaySettlementProcessor.ts) drains M4a's verified, deduplicated pending-events store into signed Settlement Confirmations, closing a Razorpay refund's lifecycle on its correlated Execution Trust Record. This is the first code in this codebase that reads `razorpay_webhook_events` back to act on anything; M4a's own claim explicitly stopped short of this.



Only `refund.processed` and `refund.failed` events are acted on; every other event type is acknowledged as ignored and audited, never treated as an error. Correlation extracts the parmana transaction id from the refund entity's `notes` tag (the same `parmana_txn` key `RazorpayConnector.createRefund` already writes) and looks up the Trust Record. Not found (the webhook can legitimately arrive before the synchronous execution path finishes writing) parks the event with bounded-attempt retry (default 5 attempts, configurable); the window exhausting produces a flagged (elevated-severity) audit event and the event is never reprocessed again; no crash, no infinite loop.



FETCH-VERIFY is load-bearing, not decorative: a webhook is treated strictly as a doorbell, never a delivery. Before any confirmation is written, an authenticated `razorpay:refund-fetch` GET (a new capability added to `RazorpayConnector` this session, reusing the exact same connector/credential wiring `razorpay:refund-create` already uses) confirms the refund's status directly from Razorpay's API. The FETCHED status, never the webhook's own claimed event type, decides `SettlementConfirmation.status` (`SETTLED` when fetched status is `"processed"`, `SETTLEMENT_FAILED` otherwise). A webhook claiming `refund.processed` whose fetched state is actually `"failed"` is recorded as `SETTLEMENT_FAILED`; the fetch call itself being unreachable parks and, on window exhaustion, produces a flagged audit event and writes no confirmation at all (fail closed: no unverified closure).



The Settlement Confirmation is a SECOND, independently signed artifact; the original Receipt is never mutated, and neither is the Trust Record's own `trustRecordHash`/`signature` (`SettlementConfirmationCrypto`, structurally identical to `ReceiptCrypto`: same `TrustRecordHasher`/`ArtifactSigner`/`FileKeyProvider`/`DEFAULT_KEY_ID` composition, so a confirmation is signed exactly the way a Receipt is and its signature verifies with the same `SignatureVerifier` used to verify Receipt signatures elsewhere in this document). It references the original Receipt id (when one exists, never a blocking dependency), the business transaction id, the triggering webhook event id, and the fetched refund status. `ExecutionTrustRecordRepository.appendSettlementConfirmation` follows the identical append-only pattern as `appendReceipt`/`appendVerification`/`appendOverride` (in-memory and Supabase, the latter backed by a new `settlement_confirmations` table mirroring `receipts`'s shape).



A `SETTLEMENT_FAILED` confirmation additionally emits a flagged (elevated-severity) audit event, and the read paths never go silent: `GET /verification/{businessTransactionId}` surfaces the latest confirmation's status, id, fetched status, and refund id alongside the verification result (a verifier sees "executed, settlement failed," not an unremarked VERIFIED); `GET /trust-records/{businessTransactionId}` surfaces the full `settlementConfirmations` array as part of the whole record.



Processing is out-of-band from the webhook request cycle by design — M4a's `200` has already returned by the time settlement processing runs. Simplest pattern consistent with the codebase: no new queue infrastructure (none existed before this session — see 3.5's own note). `RazorpaySettlementProcessor.runOnce()` is a single idempotent drain, callable directly (what the test suite does, deterministically, with no timers) or from a thin poll loop (`scripts/process-razorpay-settlements.ts`, a `setInterval` calling `runOnce()` — no cron, no job-queue dependency added). Idempotency has two independent layers: durably, a confirmation is never written twice for the same webhook event id (checked against the Trust Record itself, safe across restarts); in-process, park-retry attempt counts reset on restart, which is safe precisely because the durable check is what actually prevents a duplicate confirmation.



Live-verified (test mode): the gated live suite (3.4, `razorpay-live.integration.test.ts`) was extended with a case that, after creating a real 100-paise refund against the manually captured payment, polls live `razorpay:refund-fetch` through the full production `POST /execute` chain until Razorpay reports the refund `"processed"`, then submits a locally-injected, correctly-signed webhook event (signed with `RAZORPAY_TEST_WEBHOOK_SECRET` if configured, else the built-in test-mode placeholder) and drives `RazorpaySettlementProcessor.runOnce()` against the real Razorpay API. Run live, this produced a real signed `SETTLED` confirmation with `fetchedRefundStatus: "processed"`, referencing the real refund id. This proves fetch-verify and settlement closure work end to end against a real Razorpay test-mode account, without a public URL — but it does NOT prove Razorpay itself ever delivered a webhook: the event this test submits is constructed and signed by the test itself, not received from Razorpay's servers (see Future Claims for exactly what closes this gap).



Evidence



* packages/api/src/webhooks/RazorpaySettlementProcessor.ts (correlation, park/retry with bounded window, fetch-verify, fetched-state-wins confirmation, audit trail, runOnce/processEvent)



* packages/api/src/bootstrap/createRazorpaySettlementProcessor.ts (fail-closed: undefined when no Razorpay credential is configured, mirroring createConnectorRegistry.ts)



* scripts/process-razorpay-settlements.ts (the out-of-band poll-loop trigger; `npm run process:razorpay-settlements`)



* packages/shared/src/domain/settlement-confirmation.ts (SettlementConfirmation, SettlementStatus), packages/crypto/src/SettlementConfirmationCrypto.ts (signing, structurally identical to ReceiptCrypto.ts)



* packages/shared/src/repositories/execution-trust-record-repository.ts (appendSettlementConfirmation), packages/storage/src/memory/MemoryExecutionTrustRecordRepository.ts, packages/storage/src/supabase/SupabaseExecutionTrustRecordRepository.ts, supabase/migrations/20260718190412_add_settlement_confirmations_and_audit_severity.sql (settlement_confirmations table; widened razorpay_webhook_audit_events type constraint plus severity/confirmation_id/fetched_refund_status columns)



* packages/execution-gateway/src/connector-execution/GatewayRazorpayAdapter.ts (the `razorpay:refund-fetch` capability, GET /refunds/:id; originally added to `RazorpayConnector`, migrated in the Phase 1C refactor described in 3.4), MockRazorpayServer.ts (GET /refunds/:id simulation, setRefundStatus test hook)



* packages/api/src/routes/verify-get.ts (settlement surfaced on the verification read path, never silently)



* packages/api/tests/unit/webhooks/razorpay-settlement-processor.test.ts: processed event through signed, verifier-checked confirmation; failed event through flagged audit; webhook-claims-processed-but-fetch-says-failed (fetched state wins); park-and-retry race resolving once the Trust Record appears; park-window exhaustion (flagged, never reprocessed); fetch-verify unreachable (no confirmation, flagged, no crash); Receipt byte-identical and `trustRecordHash`/`signature` unchanged after settlement; irrelevant event types ignored, never an error; `runOnce` summary counts



* packages/api/tests/integration/razorpay-settlement.integration.test.ts: full lifecycle through the real app against MockRazorpayServer: `POST /execute` creates a mock refund, a simulated correctly-signed webhook is POSTed to the real route, `runOnce()` produces a signed `SETTLED` confirmation, and `GET /verification/{id}` surfaces it



* packages/api/tests/integration/razorpay-live.integration.test.ts: the money-moving describe block's new case: live poll of `razorpay:refund-fetch` to `"processed"`, a locally-injected signed webhook, and a live-run `SETTLED` confirmation against the real captured payment's real refund



---



## 3.7 Real Razorpay-Initiated Webhook Delivery (Scoped)



Closes the gap 3.6 explicitly left open: a real `refund.processed` webhook, delivered by Razorpay's own webhook infrastructure — not constructed or signed by this codebase's own test code — has been received, signature-verified, correlated, and closed into a signed Settlement Confirmation through the real production chain, exactly once, in test mode.



Procedure: a real API server was run locally with `POST /webhooks/razorpay` mounted behind a fresh, randomly generated, single-use secret, exposed via a `cloudflared` quick tunnel (no account, no standing infrastructure). That URL and secret were registered in the Razorpay Dashboard under **Test Mode** specifically — a Live Mode registration silently receives nothing for test-mode activity, which cost real debugging time before the correct mode was found. A real 100-paise refund was then created through the full production `POST /execute` chain (the same path 3.4 exercises), and Razorpay delivered a genuine `refund.processed` webhook to the tunnel — HMAC-SHA256 signature verified against the registered secret, event persisted through `RazorpayWebhookEventStore.recordIfUnseen`, `200` returned. `RazorpaySettlementProcessor.runOnce()`, run against that same process's stores, correlated the event to its Execution Trust Record, fetch-verified the refund's real status directly from Razorpay (`razorpay:refund-fetch`, not the webhook's own claimed status), and appended a real, independently signed `SETTLED` Settlement Confirmation — observed live: refund id redacted `rfnd_********1vGG`, confirmation id `69c44cff-568a-4161-a66c-c6906aba2e42`, `fetchedRefundStatus: "processed"`, surfaced correctly on `GET /verification/{businessTransactionId}`.



A second, earlier refund's webhook was also observed during this exercise: Razorpay retried the same event id nine times total (the initial capture-tap implementation had a bug — a second `express.raw()` layered in front of the real route's own broke under real network conditions, though it never affected refund-authorization or money-movement correctness) before the fixed path accepted a retry successfully. Its own settlement never confirmed, purely as an artifact of the demo harness being restarted mid-exercise (losing its in-memory-only Trust Record, since the exercise ran with `NODE_ENV=test` storage semantics) — not a defect in `RazorpaySettlementProcessor`, which parks and eventually flags exactly this "correlated record not found" case rather than crashing or silently dropping the event.



The captured delivery (redacted for PII — see below — and committed) is replayed in a permanent, always-running hermetic test, not a one-time manual exercise: `packages/api/tests/integration/razorpay-real-webhook-fixture.integration.test.ts` feeds the real captured bytes through the actual `/webhooks/razorpay` route and through `RazorpaySettlementProcessor.processEvent()` directly, asserting that `extractSafeMetadata`'s and the processor's correlation-extraction logic's shape assumptions — previously checked only against this codebase's own synthetic payloads — hold against what Razorpay actually sends (notably: a real refund event carries `payload.payment` and `payload.refund` as siblings, which every synthetic payload elsewhere in this suite already assumed but had never been checked against a real delivery).



PII redacted from the committed fixture after capture: `payload.payment.entity.email`, `.contact`, `.card.{id,iin,issuer,last4,network,token_iin}`, `.card_id`, `.token_id`, `.acquirer_data.auth_code`, `payload.refund.entity.acquirer_data.arn`, and the top-level `account_id`. Test-mode payment/refund/order entity ids were kept exactly as captured. Redacting the body invalidated Razorpay's original signature over the original bytes, so the fixture's stored signature is a freshly computed HMAC-SHA256 over the redacted bytes under a dedicated, non-sensitive `FIXTURE_SECRET` constant — not a claim that this exact signature is one Razorpay produced (see the fixture file's header comment for the precise distinction between what the shape proves and what the signature proves).



This claim is scoped narrowly and deliberately: one real delivery, test mode only, via a temporary tunnel with no standing public endpoint. It does not claim live-mode webhook delivery (see Future Claims), a standing/production webhook endpoint, or that Razorpay's retry behavior has been characterized beyond what was incidentally observed (nine retries of one event over several minutes).



Evidence



* packages/api/tests/fixtures/razorpay-webhook-real-delivery.ts (the captured, redacted, re-signed real delivery; full provenance in the header comment)



* packages/api/tests/integration/razorpay-real-webhook-fixture.integration.test.ts: always-running (not gated): the real payload verifies and extracts through the actual `/webhooks/razorpay` route; `RazorpaySettlementProcessor` correlates and settles the real payload via `processEvent`



* packages/connector-sdk/src/connectors/razorpay/MockRazorpayServer.ts (`seedExistingRefund`: additive test-only hook letting a hermetic test seed a refund carrying a real, externally-captured id, which the normal create flow's randomly generated id cannot reproduce)



* packages/api/README.md: "Real webhook delivery fixture" section: what the fixture proves and does not prove, PII redacted, and the tunnel procedure for reproducing a fresh capture



---



## 3.8 Deployed Environment: Full Chain via a Permanent Public Endpoint (Scoped)



Closes the last gap 3.7 left open: 3.7's real Razorpay-initiated webhook delivery was proven against a temporary `cloudflared` tunnel run locally, with no standing infrastructure. This claim proves the identical full chain — a real refund, a real Razorpay-initiated webhook, signature-verified, correlated, and closed into a signed Settlement Confirmation — against Parmana's actual deployed instance, reachable at a permanent public URL, continuously running, not a one-time local exercise.



**Deployment**: `parmana-api`, a single Docker image (see DEPLOYMENT.md), running on Fly.io across two machines in the `lhr` region (`fly.toml` declares `primary_region = 'bom'`; the actually running machines are `lhr` — this claim states the observed region, not the configured one). Durable storage (`PARMANA_STORAGE=supabase`) and the webhook/settlement event stores are Supabase-backed, shared across both machines. The API requires caller authentication at every route except `/health`, `/ready`, `/openapi.yaml`, `/documentation`, `POST /refusal/verify`, and `POST /audit/verify` (2.16): an unauthenticated `POST /execute` was observed returning `401` with `WWW-Authenticate: Bearer realm="Parmana"`, never falling open.



`POST /webhooks/razorpay` is registered permanently — not through a tunnel — at `https://parmana-api.fly.dev/webhooks/razorpay`, in the Razorpay Dashboard's Test Mode, for `refund.processed` and `refund.failed`.



**Procedure**: one authenticated, gated 100-paise refund was created through the full production `POST /execute` chain against the same manually captured test-mode payment 3.4/3.7 use, executed against the deployed instance. Razorpay created the refund (id redacted `rfnd_**********T9Cj`) and, independently, delivered a genuine `refund.processed` webhook to the permanent endpoint above. The deployed instance's webhook route verified its signature against the rotated `RAZORPAY_WEBHOOK_SECRET`, persisted the event, and the deployed settlement poll loop (`scripts/process-razorpay-settlements.ts`, `pollIntervalMs: 15000`) drained it: fetch-verified the refund's real status directly from Razorpay, and appended a signed `SETTLED` Settlement Confirmation (`confirmationId dcb06247-6e7a-4adf-b709-5da407f0b054`, `fetchedRefundStatus: "processed"`) to the Execution Trust Record, surfaced correctly on `GET /verification/{businessTransactionId}`. Elapsed time from `POST /execute` to the signed `SETTLED` confirmation: approximately 48 seconds.



Correlation is proven by construction, not just observation: `RazorpaySettlementProcessor` never queries Razorpay for refunds on its own — `runOnce()` only drains events already sitting in the durable webhook event store, and the only code path that ever writes to that store is the webhook route, only after signature verification succeeds. Since the business transaction id driving this refund was freshly generated for this exercise, a matching event could only have entered the store via a genuinely delivered, correctly signed webhook POST from Razorpay to the permanent endpoint above.



This claim is scoped narrowly: one real delivery, test mode only, against a permanent endpoint. It does not claim live-mode operation, load-bearing traffic, or high availability — the deployment runs two machines for redundancy, not for capacity or failover behavior that has been tested. [FUTURE] live-mode operation remains open (see 3.4/Future Claims).



Evidence



* `fly.toml`, `Dockerfile`, `docker/entrypoint.sh` (deployment shape)



* `packages/api/src/routes/ready.ts` (readiness probe distinguishing Supabase-backed storage from in-memory)



* `packages/api/src/middleware/caller-auth.ts` (401 + `WWW-Authenticate` on missing credential, observed live against the deployed instance)



* `scripts/process-razorpay-settlements.ts` (the deployed settlement poll loop; `RAZORPAY_SETTLEMENT_POLL_INTERVAL_MS`)



* Live smoke test performed against `https://parmana-api.fly.dev` this session: unauthenticated `POST /execute` → `401`; one authenticated 100-paise refund via `POST /execute`; `GET /verification/{businessTransactionId}` polled until `settlement.status: "SETTLED"` (confirmationId `dcb06247-6e7a-4adf-b709-5da407f0b054`, `fetchedRefundStatus: "processed"`, refund id redacted `rfnd_**********T9Cj`)



---



## 3.9 Deployed Environment: Live-Mode Full Chain (Scoped)



Closes the gap 3.4/3.8 left open: every live claim before this one was against Razorpay's test-mode API only. This claim proves the identical full chain — a real refund, a real Razorpay-initiated webhook, signature-verified, correlated, and closed into a signed Settlement Confirmation — in Razorpay **Live Mode**, against a second, separately deployed instance.



**Deployment**: `parmana-api-live`, the same Docker image (see DEPLOYMENT.md), running on Fly.io in the `sin` region (`fly.live.toml` declares `primary_region = 'sin'`; the actually running machines are also `sin` — no region mismatch this time, unlike 3.8's `parmana-api`). Durable storage (`PARMANA_STORAGE=supabase`) and the webhook/settlement event stores are Supabase-backed, shared across both machines. `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are a live-mode (`rzp_live_`) key pair, distinct from every other credential used elsewhere in this document. Caller authentication is enforced identically to 3.8: an unauthenticated `POST /execute` was observed returning `401` with `WWW-Authenticate: Bearer realm="Parmana"` against this deployment specifically.



`POST /webhooks/razorpay` is registered permanently at `https://parmana-api-live.fly.dev/webhooks/razorpay`, in the Razorpay Dashboard's **Live Mode** specifically (not Test Mode — see 3.7/3.8 for the debugging cost of getting this wrong), for `refund.processed` and `refund.failed`.



**Procedure**: a real ₹10.00 Payment Link was created and paid with a real card, live, through Razorpay-hosted checkout. One authenticated, policy-gated 100-paise refund was then created through the full production `POST /execute` chain against that payment (`pay_` id redacted below). Razorpay created the refund (id redacted `rfnd_**********WnNG`) and, independently, delivered a genuine `refund.processed` webhook to the permanent endpoint above. The deployed instance's webhook route verified its signature, persisted the event, and the deployed settlement poll loop drained it: fetch-verified the refund's real status directly from Razorpay, and appended a signed `SETTLED` Settlement Confirmation (`confirmationId 6a334df8-190d-4835-9050-b54e6657e05f`, `fetchedRefundStatus: "processed"`), surfaced correctly on `GET /verification/{businessTransactionId}`. Elapsed time from `POST /execute` to the signed `SETTLED` confirmation: approximately 43 seconds.



Correlation is proven by construction, for the same reason 3.8 states: the settlement processor never queries Razorpay on its own initiative — `runOnce()` only drains events already sitting in the durable webhook event store, and the only writer to that store is the webhook route, only after signature verification succeeds. The `businessTransactionId` driving this refund was freshly generated for this exercise, so a matching event could only have entered the store via a genuinely delivered, correctly signed Live Mode webhook POST from Razorpay.



This claim is scoped narrowly and deliberately: **one** real-money refund (₹1.00 / 100 paise), one deployed instance, one live-mode webhook delivery. It does not claim volume, sustained load, high availability, or tested failover behavior — `parmana-api-live` runs the same two-machine shape as `parmana-api` for redundancy, not capacity or failover that has been exercised. It does not claim Razorpay payout creation (RazorpayX remains a distinct, unimplemented item — see Future Claims), and it does not claim any change to Phase 1's Runtime, Policy Engine, Execution Gateway, Replay, Receipt Generation, Verification, or REST API.



Evidence



* `fly.live.toml` (app `parmana-api-live`, `primary_region = 'sin'`)



* `packages/api/src/middleware/caller-auth.ts` (401 + `WWW-Authenticate` on missing credential, observed live against this deployment)



* Live execution performed against `https://parmana-api-live.fly.dev` this session: unauthenticated `POST /execute` → `401`; a real ₹10 Payment Link paid live with a real card; one authenticated 100-paise refund via `POST /execute` against that payment; `GET /verification/{businessTransactionId}` polled until `settlement.status: "SETTLED"` (confirmationId `6a334df8-190d-4835-9050-b54e6657e05f`, `fetchedRefundStatus: "processed"`, refund id redacted `rfnd_**********WnNG`)



---



## 3.10 HubSpot Deal Stage/Amount Update Connector (Scoped)

`@parmana/connector-hubspot` is a new, standalone workspace package (not a subdirectory of `@parmana/connector-sdk`, unlike Salesforce/SAP/Oracle/Workday/Razorpay) that depends on `@parmana/connector-sdk`'s `Connector` authoring contract the same way those connectors do. It authorizes exactly one HubSpot CRM Objects API action this milestone: updating a Deal's `dealstage` property, optionally alongside `amount` in the same `PATCH /crm/v3/objects/deals/{dealId}` call. This claim covers dealstage/amount update on Deals only. Contacts, Companies, deleting or archiving deals, any HubSpot webhook/event-driven trigger, and multi-object transactions are all explicitly out of scope this milestone (see Future Claims).

`HubSpotConnector`, as originally shipped (`packages/connector-hubspot/src/HubSpotConnector.ts`; see the Phase 1C update below for where this logic lives today), is deny-by-default at the property level, not just the object-type level: a `hubspot:deal-update` request naming any property other than `dealstage`/`amount` is refused before any network call, rather than silently dropped — silently dropping an unsupported property could mask a caller's real intent behind an update that quietly did less than requested. `HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES` (`HubSpotTypes.ts`) is the single source of truth both the connector's guard and its PATCH-body construction read from.

Learning directly from this codebase's own Razorpay incidents, both fixes are structural in this connector's first version rather than retrofitted after the fact:

* **Placeholder-credential guard, from day one.** `RazorpayConnector` originally had no guard against sending its built-in test-mode placeholder credential to Razorpay's real production API — it survived only because Razorpay happened to reject an unrecognized key, an accident of Razorpay's behavior, not a guarantee this codebase controlled (see 3.4's "defense-in-depth fix" paragraph, added only after the gap was noticed). `HubSpotConnector` refuses, before any network call, to send `HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN` to HubSpot's real API (`https://api.hubapi.com`) unless `baseUrl` is explicitly overridden to a mock server — the same shape of guard, present from this connector's very first version, not added after an incident.

**Update (execution-ownership refactor, Phase 1C):** `HubSpotConnector`'s executable class -- including the property allowlist guard and the placeholder-credential guard both described above -- was migrated verbatim to `GatewayHubSpotAdapter` (`packages/execution-gateway/src/connector-execution/GatewayHubSpotAdapter.ts`), mirroring 3.4's identical Razorpay migration exactly (same commit, same "migrated verbatim... only the executable class moved" pattern). `HubSpotDealUpdateService` and `HubSpotDealUpdateHarness` no longer exist anywhere in the repository; capability identifiers and DTOs (`HubSpotCapabilities.ts`, `HubSpotTypes.ts`) stayed in `@parmana/connector-hubspot` and are imported into the adapter. `MockHubSpotServer.ts` is unchanged at its original path.
* **No bridge variable, from day one.** `createRazorpayCredentialProvider.ts`'s `NODE_ENV=test` branch originally read a word-order-swapped bridge variable (`TEST_RAZORPAY_KEY_ID`/`SECRET` instead of the documented `RAZORPAY_TEST_KEY_ID`/`SECRET`), fixed only after the fact (this document's own "fix: distinguish policy denial..." and credential-provider commits). `createHubSpotCredentialProvider.ts` reads `TEST_HUBSPOT_PRIVATE_APP_TOKEN` directly — the exact name documented in `.env.example` — with no intermediate variable to drift out of sync. Production reads `HUBSPOT_PRIVATE_APP_TOKEN`; if unset outside test mode, `createHubSpotCredentialProvider()` returns `undefined` and `createConnectorRegistry.ts` does not register the HubSpot connector at all, so `hubspot:deal-fetch`/`hubspot:deal-update` simply have no connector to resolve to (`ConnectorSdkRegistry`'s existing "No connector registered for capability" fail-closed error) — the same fail-closed absence behavior as `RAZORPAY_KEY_ID`/`SECRET`, not a startup crash or a fallback to mock credentials.

`MockHubSpotServer` (`packages/connector-hubspot/src/MockHubSpotServer.ts`) is a hermetic, in-memory stand-in for the Deals subset of the CRM Objects API (`GET`/`PATCH /crm/v3/objects/deals/:id`) used by every default test run; it never makes or receives real network traffic beyond localhost.

**Policy** (`policies/hubspot-deal-update/1.0.0/policy.json`, evaluated by the same unmodified `PolicyEngine`): a proposed `dealstage` transition is checked against `isHubSpotStageTransitionAllowed` (`HubSpotDealUpdateSignals.ts`) — forward-only through a fixed default stage order (`HUBSPOT_DEFAULT_STAGE_ORDER`), plus a fixed allowance to move to `closedlost` from any non-terminal stage; any transition out of a terminal stage (`closedwon`/`closedlost`), any backward move, and any move to or from a stage id not in the configured order are all denied. An `amount` change whose absolute delta from the deal's current amount exceeds `HUBSPOT_DEFAULT_AMOUNT_CHANGE_THRESHOLD` (10,000, in the deal's own currency units) is denied unless the caller declares `preAuthorizedForAmountChange: true`. `boundSignals` (`proposedDealStage` → `parameters.dealstage`, `proposedAmount` → `parameters.amount`) is present from this policy's first version — the same `SignalIntentBinder` hardening 3.4 added to `razorpay-refund/1.0.0/policy.json` only after a live demonstration of the amount-mismatch vector (see 3.4's "adversarial-testing hardening session" update) is applied here proactively, before any equivalent gap could be demonstrated.

**Two open decisions this milestone deliberately does not resolve, flagged here rather than silently picked:**

1. **Per-pipeline vs. global stage-transition rules.** `HUBSPOT_DEFAULT_STAGE_ORDER` is one global, hardcoded stage order, not configured per-pipeline. A HubSpot account with multiple pipelines (each with its own stage ids and ordering) is not represented — a `proposedDealStage` that happens to share a stage id with this default order is evaluated against it regardless of which pipeline the deal actually belongs to, and a deal in a genuinely different pipeline with differently-ordered or differently-named stages is not correctly modeled at all. `isHubSpotStageTransitionAllowed` accepts a `stageOrder` parameter and `buildHubSpotDealUpdateSignals`/`HubSpotDealUpdateService` thread it through, so per-pipeline configuration is a real, already-seamed extension point — it is just not wired up to anything pipeline-aware this milestone.
2. **One authorization check vs. two.** `dealstage` and `amount` are evaluated by a single policy pack under a single capability (`hubspot:deal-update`) and a single signed authorization, whether the request changes one property or both — not two independently revocable authorization scopes. This mirrors HubSpot's own API shape (`PATCH` already accepts both properties in one call) and keeps this milestone's authorization surface no larger than the underlying HTTP action, but it means an operator cannot grant "amount changes only" without also granting "dealstage changes," or vice versa, without introducing a second capability. Splitting into `hubspot:deal-update-stage` / `hubspot:deal-update-amount` (each independently authorizable, each requiring its own signed authorization even when a caller wants to change both in what HubSpot would still execute as one PATCH) remains unresolved future work.

A third, narrower point this milestone originally left unresolved: `preAuthorizedForAmountChange` was, at the time, a caller-declared boolean signal with no independent verification. Absent, it defaults to `false` — the safe default: an over-threshold amount change is denied unless a caller declares it pre-authorized.

**Update (TD-23, Phase 3C, now closed):** `preAuthorizedForAmountChange` is no longer trusted verbatim. `HubSpotSignalStateVerifier` (`packages/connector-hubspot/src/HubSpotSignalStateVerifier.ts`), constructed with a real `ApprovalVerifier` (`@parmana/approval`) unconditionally in `packages/api/src/bootstrap/createHubSpotSignalStateVerifier.ts` (that file's own comment: "approvalVerifier is always supplied here (never omitted) -- the production wiring path is where independent verification... becomes a structural invariant rather than an optional, caller-declared signal"), verifies a caller's `preAuthorizedForAmountChange: true` claim against a real, independently-issued, Ed25519-signed Approval Artifact (`SignedApproval`, `docs/architecture/phase3a-authorization-artifact-design.md`) carried in `signals.approvalArtifact` -- checking issuer identity against a registry, signature validity, expiry, capability/resource scope match, and single-use nonce consumption (`ApprovalVerifier.verify`, `packages/approval/src/ApprovalVerifier.ts`), all before the declared value is trusted. A missing, expired, wrong-scope, replayed, or unsigned artifact is treated as `preAuthorizedForAmountChange: false` regardless of what the caller declared. This closes the gap `docs/architecture/phase2l-authorization-exceptions.md` independently re-confirmed still open as of that phase.

**Operational scope, independently confirmed by Phase 3D:** `createApprovalIssuerRegistry.ts`'s `TRUSTED_APPROVAL_ISSUERS` list ships **empty by default** — no real business-approver key is provisioned in this deployment. This is the correct fail-closed starting state (every `preAuthorizedForAmountChange` claim is rejected, genuine artifact or not, until an operator adds a real entry and deploys), not a gap in the mechanism above, but it means no over-threshold `hubspot:deal-update` amount change can be legitimately approved in the current deployment as configured — only ever denied. The verification mechanism itself is proven correct by unit and integration test against synthetic issuers (below); it has not yet been exercised against a real, operator-provisioned issuer key in production. See `docs/architecture/phase3d-independent-authorization-certification.md` §4.2, §12.3.

**Test posture, in the order specified for this milestone:**

* **Hermetic first, as originally shipped.** `packages/connector-hubspot/tests/unit/` (42 tests, all passing, no network calls beyond localhost): `hubspot-connector.test.ts` (12 — fetch, dealstage-only update, combined dealstage+amount update, deny-by-default property guard before any network call, empty-update rejection, non-2xx/timeout fail-closed, bad-credential-shape rejection, token never leaked into a thrown error or response metadata, placeholder-credential guard against the real endpoint and its mock-server exemption); `hubspot-deal-update-policy.test.ts` (9 — schema validation and every rule branch, including that no rule ever produces `require_override`); `hubspot-deal-update-signals.test.ts` (12 — `isHubSpotStageTransitionAllowed`'s forward/backward/terminal/unrecognized-stage cases, `buildHubSpotDealUpdateSignals`'s delta/threshold arithmetic and boundSignals-safe omission of absent fields); `hubspot-deal-update-harness.test.ts` (9 — the full authorize → verify → execute → confirm chain against `MockHubSpotServer` for approved dealstage-only, combined, and pre-authorized-over-threshold-amount cases; policy replay with no second HTTP call; token isolation from the receipt; `businessTransactionHash` tamper rejection). **Current location, after the Phase 1C migration and TD-23 (see updates above):** `hubspot-connector.test.ts` moved to `packages/execution-gateway/tests/unit/` (12 tests, unchanged); `hubspot-deal-update-harness.test.ts` no longer exists (`HubSpotDealUpdateHarness` was deleted, not migrated); a new `HubSpotSignalStateVerifier.test.ts` (10 tests) covers the TD-23 Approval Artifact verification instead. Current total: 43 unit tests across the two packages, all passing.
* **Policy-denial-makes-zero-calls.** Proven at two layers. At the connector-execution layer (`packages/execution-gateway/tests/unit/hubspot-connector.test.ts`, following the Phase 1C migration above), a denied stage transition or over-threshold amount change makes zero `PATCH` calls, asserted by reading the deal directly off `MockHubSpotServer` afterward and confirming it is byte-for-byte unchanged — the same assertion style Razorpay's own policy-denial cases use. At the HTTP boundary (`packages/api/tests/integration/hubspot-deal-update.integration.test.ts`, 3 tests, all passing), a policy `REJECTED` decision reached through the real, production-wired `POST /execute` — the same generic caller-supplied-signals mechanism `razorpay-refund.integration.test.ts`'s own denial test exercises — is caught in `ExecutionGate.enforce` before `ExecutionComponent` ever dispatches to the connector: `response.status === 403`, `response.body.code === "POLICY_DENIED"`, and (strengthening beyond Razorpay's own precedent, which only checks the mock server's resulting state) a `fetch` spy asserting literally zero calls reached the mock server's base URL at all, for both a disallowed stage transition and an over-threshold amount change.
* **Gated live suite second — now run live, not merely confirmed to skip.** `packages/api/tests/integration/hubspot-live.integration.test.ts` (3 tests), gated behind `ALLOW_LIVE_HUBSPOT=1` + `TEST_HUBSPOT_PRIVATE_APP_TOKEN` (must start with `pat-`, checked before any network call — mirroring `RAZORPAY_TEST_KEY_ID`'s `rzp_test_` check) + `TEST_HUBSPOT_DEAL_ID` for the third, mutating case, skipped by default so this stays opt-in rather than default `npm test` behavior. An earlier session confirmed only that the suite skips cleanly with no credentials configured; this session ran it live, to completion, against a real HubSpot developer/test account, all **3/3 passing**:

  1. `hubspot:deal-fetch` against a deliberately non-existent deal id (`999999999999`), driven through the full production `POST /execute` chain, reached a real, distinguishable `4xx` HTTP response from `api.hubapi.com` — a genuine round trip, not a network failure (reachability only, mirroring `razorpay-live.integration.test.ts`'s non-existent-payment-id cases). One real call observed against `https://api.hubapi.com/crm/v3/objects/deals/999999999999...`, status ≥ 400.
  2. A policy denial (disallowed dealstage transition, `closedlost` → `qualifiedtobuy`) through the same `POST /execute` path returned `403`/`POLICY_DENIED`, and a `fetch` spy confirmed literally zero calls reached `api.hubapi.com` for the denial — `ExecutionGate.enforce` rejects before `ExecutionComponent` ever dispatches to the connector.
  3. Against the real test deal (`TEST_HUBSPOT_DEAL_ID`, redacted `********0850`): the deal's live `amount` was read via `hubspot:deal-fetch`, nudged by a fixed, small, within-threshold delta of 1 (currency unit) through `hubspot:deal-update` via `POST /execute`, confirmed changed by an independent live `GET` (a test-side oracle bypassing the connector, mirroring `razorpay-live.integration.test.ts`'s `fetchRefundsLive`), then reverted to its original value through a second `POST /execute` call and confirmed reverted by the same independent oracle. The exact real amount value is deliberately not recorded here (this document is not the place to disclose a real CRM record's business data); the assertion that matters — original value read, changed, then restored to the exact original value — passed. Non-destructive by construction, unlike Razorpay's refund (irreversible; its captured payment's remainder depletes by 100 paise per live run), so this case is safe to run repeatedly against the same test deal, and left the deal in the same state it found it.

  One bug was caught and fixed by this live run that the hermetic and HTTP-boundary suites had not caught: the mutating case's test fixture initially omitted the `proposedAmount` signal (only `amountDeltaAbs`/`amountChangeExceedsThreshold` were set), so `boundSignals`' `proposedAmount` → `parameters.amount` check (SignalIntentBinder) rejected the transaction as a signal/intent mismatch before `PolicyEngine` ever ran, surfacing as an unexpected `403` rather than the intended `200`. This was a test-fixture bug, not a connector or policy bug — the same class of mistake `boundSignals` exists to catch, this time catching a test's own signals payload rather than a caller's. Fixed by including `proposedAmount` in both the nudge and revert transactions' signals.

Evidence

* `packages/execution-gateway/src/connector-execution/GatewayHubSpotAdapter.ts`, `createGatewayHubSpotConnector.ts` (the executable connector; Bearer-auth PATCH to HubSpot's CRM API, the deny-by-default property allowlist check, and the placeholder-credential guard)

* `packages/connector-hubspot/src` (`HubSpotCapabilities`, `HubSpotMetadata`, `MockHubSpotServer`, `HubSpotTypes`, `HubSpotDealUpdateSignals`, `HubSpotDealUpdateReceipt`, `HubSpotCapabilityExecution`, `HubSpotSignalStateVerifier` — TD-23)

* `packages/execution-gateway/tests/unit/hubspot-connector.test.ts` (moved from connector-hubspot in the Phase 1C migration, 12 tests), `packages/connector-hubspot/tests/unit/hubspot-deal-update-policy.test.ts`, `hubspot-deal-update-signals.test.ts`, `HubSpotSignalStateVerifier.test.ts` (TD-23) — 43 tests total

* `policies/hubspot-deal-update/1.0.0/policy.json`

* `packages/api/src/bootstrap/createHubSpotConnector.ts` (delegates to `createGatewayHubSpotConnector`), `createHubSpotCredentialProvider.ts` (production registration; fails closed, the connector is never registered, when `HUBSPOT_PRIVATE_APP_TOKEN` is unset outside test mode), `createHubSpotSignalStateVerifier.ts` (TD-23), `createConnectorRegistry.ts` (conditional registration), `createConnectorAuthenticator.ts` (hubspot added to the trusted connector identity list)

* `packages/api/tests/integration/hubspot-deal-update.integration.test.ts` (3 tests): an approved dealstage update through a real `POST /execute` request against the production bootstrap chain (`createExecutionSystem`), landing on `MockHubSpotServer`; a policy-denied stage transition and a policy-denied over-threshold amount change through the same path, each making zero calls to the mock server (`fetch`-spy asserted)

* `packages/api/tests/integration/hubspot-live.integration.test.ts` (3 tests, gated behind `ALLOW_LIVE_HUBSPOT=1` + `TEST_HUBSPOT_PRIVATE_APP_TOKEN` + `TEST_HUBSPOT_DEAL_ID` for the third case; skipped by default) and `packages/api/tests/helpers/hubspot-live-availability.ts` (the gating logic, mirroring `razorpay-live-availability.ts`). Run live this session with all three variables configured: **3/3 passing** against a real HubSpot developer/test account — reachability, zero-calls-on-denial, and the non-destructive amount nudge-then-revert against the real test deal (redacted `********0850`), all described above.

* `.env.example` (`HUBSPOT_PRIVATE_APP_TOKEN`, `TEST_HUBSPOT_PRIVATE_APP_TOKEN`, `ALLOW_LIVE_HUBSPOT`, `TEST_HUBSPOT_DEAL_ID`, `HUBSPOT_BASE_URL`)

* Full monorepo suite run this session (`npm test`, `TEST_HUBSPOT_PRIVATE_APP_TOKEN`/`ALLOW_LIVE_HUBSPOT`/`TEST_HUBSPOT_DEAL_ID` configured so the HubSpot live suite ran rather than skipped): 710 passed, 35 skipped (the remaining gated live suites this environment did not opt into — Supabase, Razorpay), 0 failed. A separate, prior run of this same suite with no live credentials configured observed 707 passed / 37 skipped, confirming the HubSpot live suite's 3 tests move cleanly from skipped to passing and nothing else regresses. `npm run typecheck` and `npm run lint` both clean in both runs.

**Update (Phase 3D certification follow-up):** `redactHubSpotToken` (`HubSpotTypes.ts`) no longer truncates the literal Private App token (previously: first 12 characters plus an ellipsis — for HubSpot the bearer token *is* the entire credential, so this was a genuine fragment of the actual secret). It now returns a one-way, truncated SHA-256 fingerprint (`fp_` + 12 hex chars), preserving the operational "same token used across these executions" signal with zero credential bytes reaching `ConnectorResponse.metadata`, the Trust Record, or the `POST /execute` response body. `hubspot-connector.test.ts`'s redaction test now asserts the response body contains no substring of the token at all.



---



## 3.11 Durable, Third-Party-Verifiable Refusal and Audit Records (RFC-0021, Scoped)

Every policy `REJECT` decision reachable through `RuntimeEngine.execute` — an ordinary `PolicyEngine.evaluate` rejection or a `SignalIntentBinder` binding-violation rejection (2.15's sibling checks) — produces a signed, durable **Refusal Record**, independently third-party-verifiable the same way an Execution Trust Record's signature is, without requiring a caller credential or database access to check. This closes what was previously true of this codebase: an approved execution left cryptographic evidence behind (the Execution Trust Record and its signature); a refused one left only an HTTP response and whatever the caller's own logs happened to capture.

`RefusalRecordBuilder` (`packages/runtime/src/RefusalRecordBuilder.ts`) builds the record from the rejected transaction, its `Decision`, the executed intent's target/parameters, and any `SignalIntentBinder` violations; `RefusalCrypto` (`packages/crypto/src/RefusalCrypto.ts`) hashes and signs it with the same `FileKeyProvider`/`DEFAULT_KEY_ID` signing stack every other artifact in this document uses — one root of trust, not a separate one for refusals. `POST /refusal/verify` (`packages/api/src/routes/refusal-verify.ts`) verifies a submitted Refusal Record's signature and returns `{ valid }`; like `POST /audit/verify` below, it is deliberately mounted ahead of caller-auth middleware — no API key, no lookup by id, nothing but the artifact itself and Parmana's public key, which is precisely what makes a refusal independently checkable by whoever received the rejection, not only by Parmana.

Separately, and closing the analogous gap for caller-authentication and Razorpay-webhook audit trails (2.16, 2.19, 3.5): every event a **production** audit sink writes is now signed at write time with `AuditEventCrypto` (`packages/crypto/src/AuditEventCrypto.ts`, the same signing stack again), stored alongside the event as a `signature_json` column. `POST /audit/verify` (`packages/api/src/routes/audit-verify.ts`) verifies either shape — `CallerAuditEvent` or `RazorpayWebhookAuditEvent` — through one route, since `AuditEventCrypto.verify()` operates on canonical bytes and a signature alone, never dispatching on the event's own `type`.

**Scope, precisely — two caveats, both load-bearing:**

1. **Refusal Record writing is evidentiary and fails open, deliberately, not fail-closed like caller-auth audit writes (2.19).** `RuntimeEngine.writeRefusalRecord` runs after `Decision` is built but is explicitly barred, by its own comment, from affecting, delaying past that synchronous attempt, or blocking the `executionGate.enforce()` rejection that follows it — a write failure is logged (`refusal_record_write_failed`) and swallowed, never thrown. The rejection itself is unaffected either way: a request that should be denied is still denied, correctly, whether or not its evidentiary record lands. What can be silently missing is the durable proof of *why*, not the correctness of the refusal itself. `RefusalRecordBuilder`/`RefusalRecordRepository` are also optional at construction (`RuntimeFactory`'s `refusalRecords` parameter); when omitted, no Refusal Record is ever written, by design, not by failure. Verified: `packages/runtime/tests/unit/refusal-record-fail-open.test.ts`.
2. **Only production (Supabase) audit sinks sign.** `SupabaseCallerAuditSink` and `SupabaseRazorpayWebhookAuditSink` sign every event; `InMemoryCallerAuditSink` and `InMemoryRazorpayWebhookAuditSink` (test wiring, `NODE_ENV=test`) do not. This claim is therefore about the production deployment path specifically, not every configuration this codebase can run in. Existing rows written before this capability shipped remain unsigned; `signature_json` is nullable and additive, honestly reflecting that history rather than backfilling a signature that was never actually produced at write time.

A third, narrower operational note, not a scope caveat on the claim itself: `SupabaseCallerAuditSink`/`SupabaseRazorpayWebhookAuditSink` currently write via a direct Postgres connection rather than PostgREST, a temporary workaround for a PostgREST schema-cache issue with the new column (Supabase support ticket SU-437429), flagged in both files as revertible once resolved.

Evidence

* `packages/crypto/src/RefusalCrypto.ts`, `AuditEventCrypto.ts`

* `packages/runtime/src/RefusalRecordBuilder.ts`, `RuntimeEngine.ts` (`writeRefusalRecord`, fail-open by design)

* `packages/shared/src/domain/refusal-record.ts`, `repositories/refusal-record-repository.ts`

* `packages/storage/src/memory/MemoryRefusalRecordRepository.ts`, `supabase/SupabaseRefusalRecordRepository.ts`

* `packages/api/src/routes/refusal-verify.ts`, `refusal-get.ts`, `audit-verify.ts`

* `packages/api/src/auth/SupabaseCallerAuditSink.ts`, `InMemoryCallerAuditSink.ts` (signs / does not sign, respectively); `packages/api/src/webhooks/SupabaseRazorpayWebhookAuditSink.ts`, `InMemoryRazorpayWebhookAuditSink.ts` (same split)

* `04-INCIDENTS-LOG.md`, INC-7 ("Audit-sink events were durable but unsigned") — the incident this capability closes, including the PostgREST workaround noted above

* `docs/rfcs/RFC-0021-Refusal-Record.md`

* `packages/api/tests/integration/refusal-record.integration.test.ts` (6 tests), `audit-verify.integration.test.ts` (5 tests): real `POST /refusal/verify` and `POST /audit/verify` HTTP requests — valid signature accepted, tampered payload rejected, mounted ahead of caller-auth (no credential required)

* `packages/runtime/tests/unit/refusal-record-fail-open.test.ts` (2 tests): a Refusal Record write failure does not affect the returned rejection

* `packages/storage/tests/unit/supabase-refusal-record-repository.test.ts` (4 tests)



---



## 3.12 `@parmana/sign`: Open-Core Extraction of the Signing Primitives (Scoped)

The signing/verification/canonical-hashing primitives this document's cryptography claims (2.13, 2.14, and the hybrid-signing work referenced in `docs/VERIFICATION-GAPS.md` G-4) rest on have a public, independently maintained counterpart: `@parmana/sign` (`github.com/pavancharak/parmana-sign`), an npm package described in its own README as "signing, verification, and canonical hashing primitives with post-quantum (ML-DSA-65/Dilithium3) support, extracted from Parmana." It ships `SignatureProvider`, `Dilithium3SignatureProvider`, `SignatureVerifier`, `ArtifactHasher`, and `CanonicalSerializer` — the same primitives this repository's `@parmana/crypto` package builds on internally, not a reimplementation.

**This is a genuine open-core split, not "the whole platform is open source."** `@parmana/sign` itself is Apache License 2.0, its own README stating it is "fully usable on its own, independent of Parmana." This repository — the policy engine, `SignalIntentBinder`/signal-state verification, the runtime, and everything else that decides what gets signed and why — remains source-available for evaluation, all rights reserved (see `LICENSE`, root of this repo). Only the cryptographic primitives were extracted and opened; the authorization logic was not.

Independently checkable at the time of this writing: the repository carries an OpenSSF Best Practices passing badge (project #13926) and a weekly/on-push OpenSSF Scorecard, and its README states tagged releases carry SLSA Build Level 3 provenance and are signed keylessly with `cosign` via GitHub's OIDC identity.

**Scope, precisely:** this claim is about the existence, license, and stated security posture of an external repository, verified by fetching it directly — not something this repository's own `npm test` run proves, and not something re-verified on every audit pass of this document. Verifying it currently required an external fetch outside the citation discipline the rest of this document uses (a file, a line, or a specific test in *this* repo); treat this claim as weaker evidentiary footing than every other claim above for that reason. `@parmana/sign`'s `SignatureVerifier` does **not** yet recognize the `signatures`/`schemaVersion` hybrid envelope shape (`docs/VERIFICATION-GAPS.md` G-4's update) — a third-party verifier using this package today checks the legacy single-signature field only, which is by design (that field is still computed identically for hybrid-signed records) but is not a full hybrid-signature check.

Evidence

* `github.com/pavancharak/parmana-sign` (external repository; README, badge row, `LICENSE`)

* `packages/crypto/src/providers/signature/Dilithium3SignatureProvider.ts`, `SignatureVerifier.ts`, `ArtifactHasher`/`CanonicalSerializer.ts` (this repository's own, internal versions of the same primitives)



---



## 3.13 Hybrid (Ed25519 + ML-DSA-65) Signing Capability (Scoped)

Trust Records and Receipts can be dual-signed with both Ed25519 and ML-DSA-65 (post-quantum) at once, and verification can require both to independently pass. This is a built, tested capability, not yet a deployment: `CRYPTO_MODE` remains `single` by default, Ed25519 alone, everywhere this codebase runs today, including `parmana-api-live.fly.dev` (3.9). This claim is about what exists and is proven correct when explicitly turned on, not about what is currently running.

`HybridSignatureProvider` (`packages/crypto/src/HybridSignatureProvider.ts`) signs an artifact with both algorithms and verifies fail-closed: `verify()` requires exactly one entry matching the primary algorithm and one matching the secondary — a missing, extra, duplicated, or wrong-algorithm entry rejects, never a partial pass. `ExecutionTrustRecord` and `Receipt` (`packages/shared/src/domain/execution-trust-record.ts`, `receipt.ts`) gained two optional fields, `schemaVersion` and `signatures` (an array of `SignatureEntry`, `packages/shared/src/domain/signature-entry.ts`), additive only: the pre-existing single `signature` field is computed exactly as before, over exactly the same canonical content as before, so every record signed before this capability existed — and every record signed after it while `CRYPTO_MODE=single` — verifies completely unchanged. `signatures` is populated, and `schemaVersion` set to `2`, only when `CRYPTO_MODE=hybrid` is active at signing time.

`CRYPTO_MODE` (`packages/shared/src/config/CryptoAlgorithms.ts`'s `CryptoModes`, validated by `parseCryptoMode` in `ConfigValidation.ts` the same way every other config enum in this codebase is — an invalid value now fails closed at startup, rather than the untyped pass-through it was before this capability existed) is read by `VerificationCrypto.signHybrid()` and `ReceiptCrypto.createReceipt()` specifically, not globally: every other signing surface in this codebase (execution authorization, gateway attestation, connector signing) reads only `PRIMARY_SIGNATURE_PROVIDER` and is completely unaffected by `CRYPTO_MODE`, whatever it's set to. `BusinessTrustRecordBuilder` calls `signHybrid()`, in addition to its existing, unchanged `sign()` call, exactly when `CRYPTO_MODE=hybrid`. Verification mirrors this: `VerificationCrypto.verifySignature()` always checks the legacy `signature` field, and additionally, only when a record's `signatures` array is present and non-empty, requires every entry in it to independently verify too — both checks must pass for a hybrid-shaped record; a record with no `signatures` field verifies exactly as it always has.

The secondary (ML-DSA-65) key lives at a distinct keyId, `default-secondary` (`DEFAULT_SECONDARY_KEY_ID`, `packages/crypto/src/KeyProvider.ts`), alongside the existing `default` Ed25519 key under the same `PARMANA_KEY_DIR` — generated with `npm run generate:hybrid-secondary-key`. A missing secondary key file, or `CRYPTO_MODE=hybrid` without `SECONDARY_SIGNATURE_PROVIDER` configured, fails closed (a thrown error, not a silent single-signature fallback) the first time hybrid signing is attempted.

**Required caveat, load-bearing:** `@parmana/sign` (3.12), the public SDK used for independent third-party verification, does not yet recognize the `signatures`/`schemaVersion` envelope shape. Today, a third party verifying a hybrid-signed record through `@parmana/sign` checks the legacy `signature` field only — that check is genuinely correct, not a false pass, since the legacy field remains a real, valid Ed25519 signature over the record. But it is a partial verification: it does not check the ML-DSA-65 signature, and therefore does not confirm the full hybrid guarantee this capability is designed to eventually provide. Updating `@parmana/sign` to recognize the new envelope shape is untracked, separate follow-on work, not part of this capability and not a dependency of it (see 3.12).

Evidence

* `packages/crypto/src/HybridSignatureProvider.ts`

* `packages/shared/src/domain/signature-entry.ts`, `execution-trust-record.ts`, `receipt.ts` (the additive `schemaVersion`/`signatures` fields)

* `packages/shared/src/config/CryptoAlgorithms.ts` (`CryptoModes`), `ConfigValidation.ts` (`parseCryptoMode`), `Config.ts` (`crypto.mode`)

* `packages/crypto/src/VerificationCrypto.ts` (`signHybrid`, hybrid-aware `verifySignature`/`verify`), `ReceiptCrypto.ts` (hybrid-aware `createReceipt`)

* `packages/crypto/src/KeyProvider.ts` (`DEFAULT_SECONDARY_KEY_ID`), `scripts/generate-keypair.ts` (`--force`-gated overwrite protection), `package.json` (`generate:hybrid-secondary-key`)

* `packages/runtime/src/BusinessTrustRecordBuilder.ts` (calls `signHybrid()` additively when `CRYPTO_MODE=hybrid`)

* `packages/crypto/tests/unit/hybrid-signature-provider.test.ts` (7 tests: sign+verify round trip, tampered second signature rejected, second signature missing entirely rejected — not a silent downgrade to single-signature verification, duplicated single-algorithm array rejected, signature from the wrong keypair rejected, tampered artifact rejected, missing secondary key file fails closed on `sign()`)

* `packages/runtime/tests/unit/verification-service-hybrid.test.ts` (4 tests, through the real `BusinessTrustRecordBuilder` → `VerificationService` path): a hybrid-signed record verifies end to end with two independent signature entries present; a legacy-shaped record with `schemaVersion`/`signatures` stripped still verifies unchanged even while the process runs `CRYPTO_MODE=hybrid`; a hybrid record with a corrupted secondary signature is rejected; a hybrid record with the secondary signature stripped entirely is rejected

* `packages/runtime/tests/integration/receipt-hybrid.integration.test.ts` (2 tests, through the real `ReceiptService` path): a hybrid-signed Receipt's `signatures` independently re-verify via `HybridSignatureProvider` from outside the class that produced them; a tampered hybrid Receipt signature is rejected

* `packages/shared/tests/unit/config-validation.test.ts` (`parseCryptoMode` cases: selects the configured mode, defaults to `single` when unset, throws naming the invalid value)

* `docs/VERIFICATION-GAPS.md` G-4 (the gap-tracking record of exactly which signing surfaces this covers and which it doesn't)



---



# Maturity Assessment (TRL)



This is the repo owner's own maturity assessment, layered on the evidence already cited above. It is not a new technical claim in the sense sections 2 and 3 use that word, and it does not carry its own separate test evidence — it is an interpretation of evidence that does.



Parmana is assessed at **Technology Readiness Level 7**: system prototype demonstration in an operational environment. Evidence for this assessment is exactly 3.8 and 3.9 above — the full authorize → verify → execute → confirm chain, deployed on public infrastructure (Fly.io), with a real refund created, delivered via a genuine Razorpay-initiated webhook, and settled end to end, in both test mode (3.8) and live mode (3.9).



Not claimed by this assessment: sustained volume, load-bearing traffic, high availability, or multi-tenant production operation. None of 3.8 or 3.9 exercised any of those, and this assessment does not imply they were.



---



# 4. Future Claims (Pending Evidence)



The following claims are planned but are intentionally withheld until supported by implementation, testing, audit, and documented proof.



* [FUTURE] Razorpay payout creation (RazorpayX): no implementation exists. The Razorpay connector implemented in this milestone covers refund creation only.

* [FUTURE] HubSpot Contacts and Companies objects: no implementation exists. The HubSpot connector (3.10) covers Deal `dealstage`/`amount` update only.

* [FUTURE] HubSpot deal delete/archive: no implementation exists; deny-by-default this milestone touches only `dealstage`/`amount` on existing deals.

* [FUTURE] HubSpot webhook/event-driven trigger: no implementation exists. This milestone is request-response only (`POST /execute` → connector PATCH); there is no asynchronous confirmation loop analogous to the Razorpay refund connector's webhook receipt (3.5) and settlement closure (3.6/3.7/3.8/3.9) — those took four scoped milestones to build for Razorpay, and none of that has been started for HubSpot.

* [FUTURE] HubSpot multi-object transactions: no implementation exists; each `hubspot:deal-update` call is a single Deal PATCH, not a coordinated multi-object write.

* [FUTURE] HubSpot per-pipeline stage-transition configuration: `HUBSPOT_DEFAULT_STAGE_ORDER` (3.10) is one global stage order; `isHubSpotStageTransitionAllowed` accepts a `stageOrder` override but nothing wires it to a deal's actual `pipeline` property yet — see 3.10's "open decisions" for what this would take.

* [FUTURE] Stripe connector: no implementation exists; would implement @parmana/connector-sdk's Connector interface.

* [FUTURE] GitHub connector: no implementation exists.

* [FUTURE] Salesforce connector: no implementation exists.

* [FUTURE] SAP connector: no implementation exists.

* [FUTURE] ServiceNow connector: no implementation exists.

* [FUTURE] Workday connector: no implementation exists.

* [FUTURE] Slack connector: no implementation exists.

* [FUTURE] Jira connector: no implementation exists.

* [FUTURE] Database connector: no implementation exists.

* [FUTURE] Cloud credential providers: HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, and Google Secret Manager CredentialProvider implementations. Only the CredentialProvider interface seam exists today (StaticCredentialProvider, EnvironmentCredentialProvider); no cloud SDK dependency has been added.

* Every production Runtime enforces the canonical trust pipeline.

* Every production API request executes through the canonical runtime. **Reconciliation note (not a promotion — remains withheld pending whatever broader evidence standard this section applies):** Phase 3D's Property C bypass search (`docs/architecture/phase3d-independent-authorization-certification.md` §5.2) traced every route `packages/api/src/app.ts` mounts and confirmed only `POST /execute` reaches `application.execute()`/`RuntimeEngine`; every other route is read-only, verification-only, or a passive audit sink that never calls `executionSystem.execute()` or any connector. This is direct, current evidence bearing on this specific claim, scoped to the routes and connectors that exist today — flagged here so it isn't lost, without this reconciliation pass itself deciding whether it now meets this section's bar for promotion to §2.

* Replay semantically verifies every trust artifact.

* Every guarantee is fully proven through conformance testing.

* Every guarantee includes complete independent verification evidence.

* A general, named credential-brokering *mechanism* — a formal product capability letting an arbitrary future connector class (e.g. third-party cloud credentials via AWS STS, per `02-REMAINING.md`'s Tier 2 roadmap) prove "AI never possesses execution credentials" without bespoke per-connector work — does not exist; only the `CredentialProvider`/session-credential-vault pattern each connector individually implements does. **Narrowed by Phase 3D (2.22/2.23):** for the two connectors that exist today (Razorpay, HubSpot), the underlying property this future item describes — the AI-facing `/execute` request path never comes into possession of the raw connector credential, which is resolved only after authorization is fully decided, confined to the connector-execution layer — was independently traced end-to-end and verified true (`docs/architecture/phase3d-independent-authorization-certification.md` §3). What remains genuinely future is only the generalized, connector-class-agnostic mechanism, not the property itself for these two connectors. (Certification's own disclosed caveat, 2.23: a short, non-functional fingerprint of the credential, not the credential itself, reaches the caller-visible response — see 3.4/3.10.)

* Enterprise-grade key custody: current key storage is local PEM files read by FileKeyProvider; no KMS, HSM, or cloud key vault integration exists.

* Authority, Intent, and Evidence verification checks in verification-service.ts. Only integrity, signature, and authorization binding are implemented today (2.15). The prior six-stage pipeline package (@parmana/verification) was retired in Session 5; it had no real implementation and no real test coverage; its stage architecture is not being resurrected. Authority/Intent/Evidence checks, if built, will be added directly to verification-service.ts. Tracked for Session 6.

* Algorithm migration: re-keying from one signature provider to another (for example Ed25519 to ML-DSA-65) while retaining the ability to verify previously-signed records. AuthorizationVerifier does not dispatch verification based on the envelope's algorithm field; a verifying process supports exactly one configured SIGNATURE_PROVIDER at a time.

* [FUTURE] `CRYPTO_MODE=hybrid` running anywhere in staging or production: the capability described in 3.13 is built and tested but not wired into any deployed environment. `PRIMARY_SIGNATURE_PROVIDER=ed25519` alone remains the configuration everywhere this codebase currently runs, including `parmana-api-live.fly.dev` (3.9).

* [FUTURE] `@parmana/sign` recognizing the hybrid `signatures`/`schemaVersion` envelope shape (3.13's own caveat): third-party verification of a hybrid-signed record via the public SDK today checks only the legacy Ed25519 `signature` field, a genuine but partial verification. No work on `@parmana/sign` itself is in scope of this repository.



These claims will be promoted to the Supported Technical Claims section only after the required evidence is complete.



---



# 5. Claims We Intentionally Do Not Make



Parmana intentionally avoids claims that exceed the available implementation evidence.



Examples include:



* Execution is impossible to bypass under all circumstances.

* Mathematical proof of execution correctness.

* Cryptographic proof of every aspect of runtime behavior.

* Guaranteed regulatory compliance.

* Absolute prevention of all unauthorized execution.

* Tamper-proof operation in every deployment environment.

* Elimination of all software defects or operational risks.

* "Non-bypassable" or "the single execution authority" as an unscoped, system-wide claim. Envelope verification (@parmana/envelope-verifier) is opt-in per receiving endpoint and enforces nothing at the network level; see Conditional Claim 3.1 for the scoped version of this claim that is actually supported.

* Deterministic signature output for post-quantum (ML-DSA-65) signing. ML-DSA-65 signatures are randomized by design: signing the same message twice with the same key produces two different, independently valid signatures. Only signature verification is deterministic. Determinism-of-output claims (2.8) apply to Ed25519 only.



Such claims depend on deployment environments, operational controls, and assumptions beyond the scope of the reference implementation.



---



# Claim Lifecycle



Every technical claim follows the same lifecycle.



Idea



↓



Implementation



↓



Automated Tests



↓



Audit



↓



Documented Proof



↓



Public Claim



A claim SHOULD NOT be published before completing this lifecycle.



---



# Engineering Principle



Parmana favors evidence-backed engineering claims over marketing claims.



Every public technical claim should be traceable to:



* implementation

* automated tests

* audit evidence

* documented proofs

* independent verification (where applicable)



This discipline ensures that Parmana's public positioning remains aligned with its implementation and verifiable technical capabilities.



