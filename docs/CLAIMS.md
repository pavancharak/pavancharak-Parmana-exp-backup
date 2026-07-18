\# Parmana Technical Claims



Version: 1.0



Status: Public



\---



\# Key Compromise Notice



The default signing key (\`keys/default.private.pem\` / \`keys/default.public.pem\`) committed to this repository prior to 2026-07-05 was publicly exposed in the public GitHub repository. The private key must be treated as permanently compromised.



All signatures produced by that key are void for authenticity purposes, regardless of when the signed artifact was created.



The key pair was rotated on 2026-07-05.



\---



\# Purpose



This document defines the public technical claims that Parmana makes about its architecture and capabilities.



Claims are categorized according to the level of implementation evidence available.



A technical claim SHOULD be promoted only when supported by:



\* implementation

\* automated tests

\* audit evidence

\* documented proofs

\* independent verification (where applicable)



\---



\# 1. Core Positioning



\## Category



Parmana is \*\*Execution Trust Infrastructure\*\*.



\## Mission



Parmana establishes a verifiable trust chain between business authorization, policy evaluation, runtime execution, and execution evidence.



\## Value Proposition



Parmana enables organizations to verify what automated systems executed—not simply trust that they executed correctly.



\---



\# 2. Supported Technical Claims



The following claims are supported by the current implementation and architecture.



\---



\## 2.1 Trusted Business Transactions



Parmana validates Business Transactions before execution.



Business Transactions are checked for internal trust-chain consistency before entering the runtime.



Evidence



\* BusinessTransactionValidator

\* G-01 Trusted Business Transaction



\---



\## 2.2 Deterministic Policy Selection



Parmana executes exactly one explicitly referenced business policy.



The runtime loads the policy identified by the Business Transaction and validates its identity before evaluation.



The runtime does not:



\* discover policies

\* negotiate policies

\* automatically select the latest version

\* substitute alternative policies



Evidence



\* PolicyRouter

\* PolicyValidator

\* G-02 Deterministic Policy Selection



\---



\## 2.3 Deterministic Policy Evaluation



Parmana deterministically evaluates business policies using sequential rule evaluation with first-match semantics.



Evaluation records include:



\* matched rule

\* decision reason

\* evaluation trace



Evidence



\* PolicyEngine

\* G-03 Deterministic Policy Evaluation



\---



\## 2.4 Authorized Execution



Parmana prevents execution when required trust artifacts are missing or when the decision outcome is not approved.



Evidence



\* TrustChainValidationComponent

\* RuntimeEngine

\* G-04 Authorized Execution



\---



\## 2.5 Verifiable Execution Evidence



Parmana generates cryptographically verifiable execution evidence.



Execution produces:



\* Execution Trust Records

\* Canonical Trust Record hashes

\* Signed Receipts



Evidence



\* ExecutionTrustRecordBuilder

\* VerificationCrypto

\* ReceiptCrypto

\* G-05

\* G-06



\---



\## 2.6 Independent Verification



Parmana supports independent verification of execution evidence.



Verification can confirm execution integrity using the generated execution artifacts.



Evidence



\* packages/runtime/src/services/verification-service.ts

\* packages/runtime/test/verification-service.test.ts

\* VerificationCrypto

\* G-07



\---



\## 2.7 Replay Support



Parmana supports replay of recorded execution decisions for verification and analysis.



Evidence



\* Replay package

\* G-08



\---



\## 2.8 Signed, Single-Use, Time-Bounded Execution Authorization



Every approved execution request carries a cryptographically signed Execution Authorization scoped to one decision, bound to a single-use nonce, and valid only within a bounded time window (Ed25519 by default; ML-DSA-65 / FIPS 204 configurable via SIGNATURE\_PROVIDER).



Evidence



\* AuthorizationSigner

\* AuthorizationVerifier

\* EnvelopeVerifier

\* MemoryNonceStore

\* packages/crypto/test/authorization-envelope.test.ts

\* packages/envelope-verifier/test/envelope-verifier.test.ts



\---



\## 2.9 Independent Envelope Verification



A receiving system can independently verify that Parmana authorized an execution request without trusting Parmana's runtime process or its database. Verification requires only Parmana's public key and the envelope itself.



Evidence



\* @parmana/envelope-verifier (EnvelopeVerifier, requireParmanaAuthorization)

\* packages/envelope-verifier/README.md ("Claims" section)



\---



\## 2.10 Rejection of Forged, Tampered, Expired, and Replayed Authorizations



The receiving system rejects a forged signature, a tampered payload, an expired envelope, and a replayed (previously accepted) envelope. Replay protection is scoped to whichever NonceStore instance performs the check — see 3.2 below.



Evidence



\* packages/envelope-verifier/tests/unit/envelope-verifier.test.ts — "a forged envelope does not burn the nonce", "an expired envelope does not burn the nonce", "rejects a second use of the same nonce", "treats the exact expiresAt instant as expired (boundary is exclusive, not inclusive)", "under two concurrent verify() calls with one nonce, exactly one succeeds (deterministic, not flaky)"



\---



\## 2.11 Trust Record Bound to Its Authorization



The Execution Trust Record's authorizationId is part of the canonical content that is hashed and signed, not merely attached alongside it. Tampering with it changes the recomputed Trust Record hash.



Evidence



\* ExecutionTrustRecordBuilder

\* packages/runtime/test/execution-authorization-wiring.test.ts — "trust record references the authorization"



\---



\## 2.12 Fail-Closed Authorization on Rejection



A rejected Decision never produces a Signed Execution Authorization.



Evidence



\* RuntimeEngine (authorization signing occurs only after executionGate.enforce() approves the Decision)

\* packages/runtime/test/execution-authorization-wiring.test.ts — "rejected transaction produces no authorization"



\---



\## 2.13 Key/Algorithm Binding Guard



Signing or verifying with key material of the wrong type (for example, an Ed25519 key against the configured ML-DSA-65 provider, or vice versa) fails closed with a clear error naming both the expected and actual key type, rather than silently dispatching on the key's own type.



Evidence



\* assertKeyType (used by Ed25519SignatureProvider and Dilithium3SignatureProvider)

\* packages/crypto/test/SignatureProvider.test.ts



\---



\## 2.14 Configurable Post-Quantum Signing (ML-DSA-65)



Post-quantum signing (ML-DSA-65, FIPS 204, historically referred to in this codebase as "dilithium3") is selectable via SIGNATURE\_PROVIDER, using the same PEM-based persistent key mechanism as the default Ed25519 provider (FileKeyProvider, keyId "default"). Requires Node >= 24 for native node:crypto ml-dsa-65 support. Selecting it with missing or mismatched key material fails closed rather than silently regenerating or substituting different keys.



Evidence



\* Dilithium3SignatureProvider

\* FileKeyProvider

\* generate-keypair.ts (--algorithm dilithium3)

\* packages/crypto/test/Dilithium3SignatureProvider.test.ts

\* packages/crypto/test/dilithium3-cross-instance.test.ts



\---



\## 2.15 Authorization-Binding Verification



Every APPROVED execution in a verified Execution Trust Record must carry a non-empty authorizationId in its metadata; absence fails verification and names the execution. REJECTED-decision executions are not required to carry one. All checks (integrity, signature, authorization binding) run unconditionally and independently — a single failure never suppresses reporting of the others.



Evidence



\* VerificationService (packages/runtime/src/services/verification-service.ts)

\* packages/runtime/tests/unit/verification-service.test.ts — all 6 cases

\* packages/runtime/tests/unit/verification-negative.test.ts — always-running, in-memory: fails on a mutated transaction payload field, a mutated signature value, and a mutated executions hash-chain-array element

\* packages/api/tests/integration/verification-negative.integration.test.ts — "reports FAILED when the persisted record is tampered after execution" (additional citation; Supabase-gated, does not run without live credentials)



\---



\## 2.16 Caller Authentication at the API Boundary



Every route except /health requires a valid caller credential. createApp's callerAuth option is mandatory — it accepts either an authenticator/auditSink pair or the literal string "disabled" — so every call site states its choice explicitly; there is no default that silently mounts the API with no caller authentication. Production (server.ts) refuses to start with PARMANA\_AUTH\_DISABLED unset and no PARMANA\_API\_KEYS configured (2.17). A key valid for one caller does not grant a different caller's identity, and every accept/reject outcome is audited without ever recording the raw key. In production, that audit trail is durable — see 3.2's sibling claim for the NonceStore side of the same fix — backed by Supabase and shared across every process, not scoped to one process's uptime; \`createCallerAuditSink.ts\` fails closed at startup if Supabase is not configured. \`InMemoryCallerAuditSink\` remains available and correct for tests (NODE\_ENV=test).



Evidence



\* packages/api/src/app.ts (CallerAuthOption: "disabled" | { authenticator, auditSink }, required, no default)

\* packages/api/src/bootstrap/createCallerAuthenticator.ts

\* packages/api/src/bootstrap/createCallerAuditSink.ts (production wiring; fails closed when Supabase is not configured)

\* packages/api/src/auth/StaticKeyAuthenticator.ts

\* packages/api/src/auth/SupabaseCallerAuditSink.ts / InMemoryCallerAuditSink.ts

\* packages/api/tests/integration/supabase-caller-audit-sink.integration.test.ts — a recorded event is read back through a second, independent client

\* packages/api/tests/integration/caller-auth.integration.test.ts (valid/missing/invalid credential, scoping and revocation, audit trail content never contains the raw key, composition with policy evaluation, full route inventory)

\* packages/api/tests/unit/bootstrap/create-caller-authenticator.test.ts



\---



\## 2.17 Fail-Closed Startup Configuration Validation



Parmana refuses to start rather than let missing required configuration surface later as an unstructured runtime error. This applies to caller authentication keys (PARMANA\_API\_KEYS, unless PARMANA\_AUTH\_DISABLED=true is set explicitly), the policy directory (PARMANA\_POLICY\_DIR), and — in production wiring — the durable NonceStore and CallerAuditSink's Supabase configuration alike: all fail at startup with an error naming the missing variable, rather than PARMANA\_POLICY\_DIR surfacing as an unhandled ERR\_INVALID\_ARG\_TYPE inside FilePolicyRepository.load at request time, or a NonceStore/CallerAuditSink silently degrading to an in-memory implementation.



Evidence



\* packages/api/src/bootstrap/createCallerAuthenticator.ts

\* packages/shared/src/config/Config.ts (requirePolicyDirectory)

\* packages/api/src/bootstrap/assertSupabaseConfigured.ts, used by createNonceStore.ts and createCallerAuditSink.ts

\* packages/shared/tests/unit/config.test.ts — "refuses to start when PARMANA\_POLICY\_DIR is unset", "refuses to start when PARMANA\_POLICY\_DIR is blank"

\* packages/api/tests/unit/bootstrap/create-caller-authenticator.test.ts

\* packages/api/tests/unit/bootstrap/create-nonce-store.test.ts, create-caller-audit-sink.test.ts — "fails closed with a named, actionable error when NODE\_ENV is not test and Supabase is not configured", "never silently falls back" to the in-memory implementation



\---



\## 2.18 Key Provider Input Validation



FileKeyProvider rejects any keyId that does not match ^\[A-Za-z0-9._-\]+$ before constructing a filesystem path from it, closing the path-traversal surface a crafted keyId (for example, containing "../") would otherwise open against the configured key directory.



Evidence



\* packages/crypto/src/providers/key/FileKeyProvider.ts (assertValidKeyId)

\* packages/crypto/tests/unit/file-key-provider.test.ts — rejects a path-traversal keyId in getPrivateKey, getPublicKey, hasKey, and getMetadata



\---



\## 2.19 Fail-Closed Caller-Authentication Audit Writes



A caller-authentication event (accepted or rejected) that fails to be recorded fails the request. \`middleware/caller-auth.ts\` wraps every \`CallerAuditSink.record()\` call: on success the request proceeds exactly as before; on failure the request is rejected with \`AuditUnavailableError\` (503, code \`AUDIT\_UNAVAILABLE\`) and a structured log entry naming the failure, rather than proceeding unaudited or crashing as an unhandled rejection. This is a deliberate design decision — an action that executes without an audit record contradicts independently verifiable execution — not an incidental side effect; the availability cost is accepted. No retry, buffering, or queueing exists: a failure fails closed immediately, once, every time.



Evidence



\* packages/api/src/middleware/caller-auth.ts (recordOrFailClosed)

\* packages/api/src/auth/AuditUnavailableError.ts

\* packages/api/tests/unit/middleware/caller-auth.test.ts — both success paths unchanged; both failure paths rejected with \`AuditUnavailableError\` (503/AUDIT\_UNAVAILABLE), not a 401 and not a silent pass-through; the structured log entry's exact shape; the sink is called exactly once (no retry)

\* packages/api/tests/unit/supabase-caller-audit-sink.test.ts — \`SupabaseCallerAuditSink\` propagates storage errors rather than swallowing them, which is what makes this guard reachable in production wiring



\---



\## 2.20 Atomic Rejection of Duplicate Business Transactions



Creating a Business Transaction with a \`businessTransactionId\` that already exists is rejected atomically, with the identical \`DuplicateBusinessTransactionError\` regardless of storage backend. \`MemoryBusinessTransactionRepository.create()\` performs its existence check and its write in the same synchronous tick, with no \`await\` between them, so two concurrent calls for the same id cannot interleave; \`SupabaseBusinessTransactionRepository.create()\` relies on the \`business\_transaction\_id\` column's \`PRIMARY KEY\` constraint and maps the resulting \`23505\` unique-violation to the same error class. Neither implementation ever silently overwrites an existing transaction.



Evidence



\* packages/storage/src/memory/MemoryBusinessTransactionRepository.ts

\* packages/storage/src/supabase/SupabaseBusinessTransactionRepository.ts (isUniqueViolation mapping)

\* packages/shared/src/errors/duplicate-business-transaction-error.ts

\* packages/storage/tests/unit/memory-business-transaction-repository.test.ts — two simultaneous \`create()\` calls with the same id and different content: exactly one succeeds, the other rejects with \`DuplicateBusinessTransactionError\`, and the stored record is exactly the winner's

\* packages/storage/tests/unit/business-transaction-repository-duplicate-consistency.test.ts — both repository implementations throw the identical error class and message for a duplicate

\* packages/storage/tests/integration/supabase-business-transaction-duplicate.integration.test.ts — the same concurrent-race proof against a real Postgres database (Supabase-gated)



\---



\# 3. Conditional Claims



The following claims are true only under an explicitly stated scope. The scope clause is load-bearing: removing it makes the claim false.



\---



\## 3.1 Non-Bypassable Envelope Verification (Scoped)



For any system running the Parmana envelope verifier, execution requests not authorized by Parmana are cryptographically impossible to accept.



This claim holds only for a receiving system that (a) runs @parmana/envelope-verifier and (b) gates every execution-triggering code path behind its verification result. Parmana enforces nothing at the network level. A receiving system that does not call the verifier, or that calls it but does not act on a failing result, is not covered by this claim.



Evidence



\* @parmana/envelope-verifier (EnvelopeVerifier.verify, requireParmanaAuthorization)



\---



\## 3.2 Fleet-Wide Single-Use Requires a Shared NonceStore



Single-use enforcement of an authorization's nonce is scoped to whichever NonceStore instance performs the check. If multiple independent receiving systems, or multiple instances of the same system, each use their own NonceStore, the same authorization can be accepted once per instance. Fleet-wide single-use requires every instance to share one persistent NonceStore that survives a process restart, not a per-process, in-memory one.



Parmana's own production gateway does this by default. \`packages/api/src/bootstrap/createNonceStore.ts\` wires in \`SupabaseNonceStore\` (\`packages/storage/src/supabase/SupabaseNonceStore.ts\`) — a durable, Postgres-backed NonceStore shared across every process pointed at the same Supabase project — and fails closed at startup if it is not configured, rather than silently falling back to a per-process \`MemoryNonceStore\`. A receiving system that does not share a persistent NonceStore (whether by choice, misconfiguration, or because it is not Parmana's own gateway) still has its exposure window bounded by the envelope's short TTL, not unlimited — this is the general, deployment-agnostic version of the claim, and still the correct one for any \`@parmana/envelope-verifier\` integrator supplying their own NonceStore choice; \`MemoryNonceStore\` remains available and correct for tests.



Evidence



\* NonceStore / MemoryNonceStore / SupabaseNonceStore

\* packages/api/src/bootstrap/createNonceStore.ts (production wiring; fails closed when Supabase is not configured, never falls back to in-memory)

\* packages/storage/tests/integration/supabase-nonce-store.integration.test.ts — "a nonce consumed through one store instance is still consumed by a fresh instance against the same backing" (the fleet-sharing / restart-survival proof) and "two simultaneous checkAndRecord calls for the same nonce: exactly one succeeds" (a real concurrent-INSERT race against Postgres, not a simulated one)

\* packages/envelope-verifier/README.md ("Claims", "PRODUCTION WARNING: MemoryNonceStore")



\---



\## 3.3 Connector SDK Foundation (Scoped)



@parmana/connector-sdk defines a Connector authoring contract (Connector, ConnectorRequest, ConnectorResponse, ConnectorExecutionContext, ConnectorCapability, ConnectorMetadata, ConnectorVersion, ConnectorHealth, ConnectorFactory) and extends execution-control's ConnectorRegistry, CredentialVault, and ConnectorPolicy seams without modifying them. This claim covers only the foundation: two reference connectors (HttpConnector, MockConnector), a credential-provider seam (StaticCredentialProvider, EnvironmentCredentialProvider), and deterministic connector evidence attached to the existing Execution Trust Record via the existing, unmodified ExecutionEvidence.attributes path and the existing TrustRecordHasher. It does not claim any enterprise-specific connector, any cloud secret-manager integration, or any change to Phase 1's Runtime, Policy Engine, Execution Gateway, Replay, Receipt Generation, Verification, or REST API — all of which remain exactly as evidenced elsewhere in this document.



Evidence



\* packages/connector-sdk/src (Connector, ConnectorRegistry, CredentialProvider, SdkConnectorExecutor, HttpConnector, MockConnector, CapabilityConnectorPolicy)

\* packages/connector-sdk/tests/unit (45 tests: registry, credential-provider leak checks, HttpConnector incl. timeout/fail-closed, MockConnector, evidence hashing/redaction, end-to-end Gateway integration, Execution Trust Record hash-boundary regression)

\* policies/connector-capability/1.0.0/policy.json (reference policy: ALLOW crm:read, BLOCK crm:delete, threshold-gated payments:refund, default BLOCK, no approval-workflow outcome)



\---



\## 3.4 Razorpay Refund Connector (Scoped)



Razorpay refunds are authorized against a deterministic policy pack (payment must exist and be captured, currency must be INR, amount must not exceed the refundable remainder, a per-refund cap, a daily cumulative cap tracked through the existing storage layer) and executed with credentials the requesting code never holds: key\_id and key\_secret are resolved only inside the existing session credential vault, at execution time, and destroyed immediately afterward by the existing try/finally pattern. A signed authorization and the existing, unmodified Execution Gateway pipeline (envelope verification, one-time Gateway sessions, session-credential issuance/consumption/destruction) carry every request. A repeated request for the same parmana transaction id is answered from a local outcome cache before any network call is made; independently, before every refund-create call the connector lists existing Razorpay refunds for the payment and treats one already tagged with the same transaction id as already executed, never creating a duplicate. This claim covers refund creation only. It does not claim payout creation (RazorpayX), webhooks, or live-mode operation, and it does not claim any change to Phase 1's Runtime, Policy Engine, Execution Gateway, Replay, Receipt Generation, Verification, or REST API, all of which remain exactly as evidenced elsewhere in this document.



Evidence



\* packages/connector-sdk/src/connectors/razorpay (RazorpayConnector, RazorpayRefundService, RazorpayRefundHarness, RazorpayCumulativeRefundLedger, RazorpayRefundReceipt, MockRazorpayServer)

\* packages/connector-sdk/tests/unit/razorpay-connector.test.ts, razorpay-refund-policy.test.ts, razorpay-refund-service.test.ts (approval and execution, denial for each policy rule, application-level idempotency with no duplicate create call, replay with no second HTTP call at all, key\_secret absence from evidence/receipt/thrown errors, tamper rejection via businessTransactionHash verification)

\* policies/razorpay-refund/1.0.0/policy.json

\* examples/tutorials/61-razorpay-refund (four outcomes: approved and executed, denied by policy, replay returning the recorded result, tamper rejected)



\---



\# 4. Future Claims (Pending Evidence)



The following claims are planned but are intentionally withheld until supported by implementation, testing, audit, and documented proof.



\* \[FUTURE\] Razorpay payout creation (RazorpayX) and webhook handling: no implementation exists for either. The Razorpay connector implemented in this milestone covers refund creation only.

\* \[FUTURE\] Stripe connector — no implementation exists; would implement @parmana/connector-sdk's Connector interface.

\* \[FUTURE\] GitHub connector — no implementation exists.

\* \[FUTURE\] Salesforce connector — no implementation exists.

\* \[FUTURE\] SAP connector — no implementation exists.

\* \[FUTURE\] ServiceNow connector — no implementation exists.

\* \[FUTURE\] Workday connector — no implementation exists.

\* \[FUTURE\] Slack connector — no implementation exists.

\* \[FUTURE\] Jira connector — no implementation exists.

\* \[FUTURE\] Database connector — no implementation exists.

\* \[FUTURE\] Cloud credential providers — HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, and Google Secret Manager CredentialProvider implementations. Only the CredentialProvider interface seam exists today (StaticCredentialProvider, EnvironmentCredentialProvider); no cloud SDK dependency has been added.

\* Every production Runtime enforces the canonical trust pipeline.

\* Every production API request executes through the canonical runtime.

\* Replay semantically verifies every trust artifact.

\* Every guarantee is fully proven through conformance testing.

\* Every guarantee includes complete independent verification evidence.

\* AI systems never possess or hold Parmana's execution credentials — no credential-brokering mechanism exists in the current implementation.

\* Enterprise-grade key custody — current key storage is local PEM files read by FileKeyProvider; no KMS, HSM, or cloud key vault integration exists.

\* Authority, Intent, and Evidence verification checks in verification-service.ts. Only integrity, signature, and authorization binding are implemented today (2.15). The prior six-stage pipeline package (@parmana/verification) was retired in Session 5 — it had no real implementation and no real test coverage; its stage architecture is not being resurrected. Authority/Intent/Evidence checks, if built, will be added directly to verification-service.ts. Tracked for Session 6.

\* Algorithm migration — re-keying from one signature provider to another (for example Ed25519 to ML-DSA-65) while retaining the ability to verify previously-signed records. AuthorizationVerifier does not dispatch verification based on the envelope's algorithm field; a verifying process supports exactly one configured SIGNATURE\_PROVIDER at a time.



These claims will be promoted to the Supported Technical Claims section only after the required evidence is complete.



\---



\# 5. Claims We Intentionally Do Not Make



Parmana intentionally avoids claims that exceed the available implementation evidence.



Examples include:



\* Execution is impossible to bypass under all circumstances.

\* Mathematical proof of execution correctness.

\* Cryptographic proof of every aspect of runtime behavior.

\* Guaranteed regulatory compliance.

\* Absolute prevention of all unauthorized execution.

\* Tamper-proof operation in every deployment environment.

\* Elimination of all software defects or operational risks.

\* "Non-bypassable" or "the single execution authority" as an unscoped, system-wide claim. Envelope verification (@parmana/envelope-verifier) is opt-in per receiving endpoint and enforces nothing at the network level — see Conditional Claim 3.1 for the scoped version of this claim that is actually supported.

\* Deterministic signature output for post-quantum (ML-DSA-65) signing. ML-DSA-65 signatures are randomized by design — signing the same message twice with the same key produces two different, independently valid signatures. Only signature verification is deterministic. Determinism-of-output claims (2.8) apply to Ed25519 only.



Such claims depend on deployment environments, operational controls, and assumptions beyond the scope of the reference implementation.



\---



\# Claim Lifecycle



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



\---



\# Engineering Principle



Parmana favors evidence-backed engineering claims over marketing claims.



Every public technical claim should be traceable to:



\* implementation

\* automated tests

\* audit evidence

\* documented proofs

\* independent verification (where applicable)



This discipline ensures that Parmana's public positioning remains aligned with its implementation and verifiable technical capabilities.



