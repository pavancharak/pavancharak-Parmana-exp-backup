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

The Razorpay connector is also registered in the production API bootstrap (\`packages/api/src/bootstrap/createConnectorRegistry.ts\`), reachable through the existing, unmodified \`POST /execute\` endpoint by capability-based routing — the same mechanism that already reaches the vendor-payment connector — rather than only through unit tests and the standalone tutorial. Reached this way, policy is evaluated against caller-supplied signals, the same generic mechanism vendor-payment already uses; this path does not carry RazorpayRefundService's additional fetch-the-payment-before-evaluating-policy behavior, which remains a separate, test/tutorial-only harness (RazorpayRefundHarness), unchanged. Credentials (\`RAZORPAY\_KEY\_ID\` / \`RAZORPAY\_KEY\_SECRET\`) are resolved by a dedicated environment-backed provider at execution time only, following the same session-credential isolation as every other production connector. If either variable is unset outside test mode, the connector is not registered at all — \`razorpay:payment-fetch\` and \`razorpay:refund-create\` simply have no connector to resolve to (ConnectorSdkRegistry's existing "No connector registered for capability" error) — rather than the process starting with a mock or partially-configured credential, or the whole API refusing to start over one optional connector.

Reachability proof for this API-wired path is no longer MockRazorpayServer-only. \`packages/api/tests/integration/razorpay-live.integration.test.ts\`, gated behind \`ALLOW\_LIVE\_RAZORPAY=1\` plus a real \`RAZORPAY\_TEST\_KEY\_ID\` (must start with \`rzp\_test\_\`, checked before any network call) / \`RAZORPAY\_TEST\_KEY\_SECRET\` pair — mirroring \`ALLOW\_LIVE\_SUPABASE\`, skipped by default so this stays opt-in rather than a default \`npm test\` behavior — drives the same production bootstrap chain through a real \`POST /execute\` against Razorpay's actual test-mode API (\`https://api.razorpay.com\`). Two cases in this file target a deliberately non-existent payment id and only prove reachability (a real, distinguishable HTTP response — not a network-level failure — for \`razorpay:payment-fetch\` and \`razorpay:refund-create\`'s pre-create idempotency-listing GET), never reaching a money-moving call.

A third, independently gated case — requiring one additional variable, \`TEST\_RAZORPAY\_CAPTURED\_PAYMENT\_ID\`, naming a Razorpay test-mode payment captured once, manually, through client-side Checkout (there is no server-side API to create one) — goes further and has now been run live to completion. **Razorpay test mode, against a manually captured Checkout payment, 100 paise, via the production \`POST /execute\` chain**: a refund was created (Razorpay refund entity id observed, redacted: \`***************pG6B\`; amount confirmed 100 paise in both the outgoing request and Razorpay's response; \`notes.parmana\_txn\` carrying the businessTransactionId). Idempotency was proven live, not assumed: resubmitting the identical businessTransactionId was rejected with HTTP 409 by \`BusinessTransactionService.accept()\`'s uniqueness guard (packages/runtime/src/services/business-transaction-service.ts) — a layer upstream of both RazorpayConnector's own pre-create listing check and RazorpayRefundService's local outcome cache (the latter unreachable from this HTTP route entirely) — before RuntimeEngine, policy evaluation, or the connector were ever invoked; zero calls to \`api.razorpay.com\` were made for the repeat. An independent, out-of-band live listing (test-side oracle, bypassing the connector) then confirmed exactly one refund exists for the payment carrying that transaction id. A third sub-case discovered the payment's real remaining refundable amount live (through a \`razorpay:payment-fetch\` call, not guessed), requested a refund exceeding it, and confirmed policy denial with zero calls to Razorpay. This is the first live execution of the money-moving refund-create call in this codebase's history. It does not claim live-mode (as opposed to test-mode) operation, or webhook handling (M4) — both remain future work (see Future Claims).

A defense-in-depth fix accompanies this: RazorpayConnector itself (packages/connector-sdk/src/connectors/razorpay/RazorpayConnector.ts) now refuses, before any network call, to send the built-in test-mode placeholder credential (createRazorpayCredentialProvider.ts's fallback when no real test-mode credential is configured) to Razorpay's real API — that placeholder is only ever safe against a mock server reached through an explicit \`baseUrl\` override, and this guard makes that a structural guarantee rather than an accident of Razorpay rejecting unrecognized credentials. Separately, \`createRazorpayCredentialProvider.ts\`'s test-mode branch now reads \`RAZORPAY\_TEST\_KEY\_ID\`/\`RAZORPAY\_TEST\_KEY\_SECRET\` directly — the same names documented in \`.env.example\` — removing a prior word-order-swapped bridge variable that depended on call sites remembering to copy one name into the other.



Evidence



\* packages/connector-sdk/src/connectors/razorpay (RazorpayConnector, RazorpayRefundService, RazorpayRefundHarness, RazorpayCumulativeRefundLedger, RazorpayRefundReceipt, MockRazorpayServer)

\* packages/connector-sdk/tests/unit/razorpay-connector.test.ts, razorpay-refund-policy.test.ts, razorpay-refund-service.test.ts (approval and execution, denial for each policy rule, application-level idempotency with no duplicate create call, replay with no second HTTP call at all, key\_secret absence from evidence/receipt/thrown errors, tamper rejection via businessTransactionHash verification)

\* policies/razorpay-refund/1.0.0/policy.json

\* examples/tutorials/61-razorpay-refund (four outcomes: approved and executed, denied by policy, replay returning the recorded result, tamper rejected)

\* packages/api/src/bootstrap/createRazorpayConnector.ts, createRazorpayCredentialProvider.ts (production registration; fails closed — the connector is never registered — when \`RAZORPAY\_KEY\_ID\` / \`RAZORPAY\_KEY\_SECRET\` are unset outside test mode), createConnectorRegistry.ts (conditional registration), createConnectorAuthenticator.ts (razorpay added to the trusted connector identity list)

\* packages/api/tests/unit/bootstrap/create-razorpay-credential-provider.test.ts, create-connector-registry.test.ts (credential present/absent/malformed cases; fail-closed capability resolution when unconfigured; vendor-payment remains resolvable when razorpay is not; key\_secret never embedded in a thrown error)

\* packages/api/tests/integration/razorpay-refund.integration.test.ts — a refund authorized, verified, and executed through a real \`POST /execute\` HTTP request against the production bootstrap chain (\`createExecutionSystem\`), landing on MockRazorpayServer; and a policy-denied refund through the same path making zero calls to Razorpay

\* packages/api/tests/integration/razorpay-live.integration.test.ts — the only test in this codebase that calls a real Razorpay endpoint, gated behind \`ALLOW\_LIVE\_RAZORPAY=1\` + real test-mode credentials (skipped by default). Two cases prove reachability only, against a deliberately non-existent payment id. A third, independently gated case (additionally requiring \`TEST\_RAZORPAY\_CAPTURED\_PAYMENT\_ID\`) creates a real 100-paise refund against a manually captured test-mode payment through the full production \`POST /execute\` chain, proves idempotency live (a same-id repeat is rejected with HTTP 409 before any second Razorpay call, independently confirmed via a live refunds listing), and proves policy denial live for a refund exceeding the payment's real remaining refundable amount (zero Razorpay calls)

\* packages/connector-sdk/tests/unit/razorpay-connector.test.ts — regression coverage added alongside this: RazorpayConnector refuses to send the built-in test-mode placeholder credential to Razorpay's real API before any network call (fetch spy asserts zero calls), and confirms the same placeholder still works normally against a mock server (baseUrl override) — the guard is real-endpoint-specific, not a behavior change for existing mock-based tests



\---



\## 3.5 Razorpay Webhook Receipt (M4a, Scoped)



\`POST /webhooks/razorpay\` receives Razorpay webhook deliveries, verifies their signature, and durably deduplicates them by event id. This milestone stops there: a verified, fresh event is persisted to a pending-events store and acknowledged. It does not claim settlement confirmation, any Execution Trust Record lifecycle change, or a fetch-verify round trip against Razorpay — processing a persisted event is explicitly out of scope (M4b, see Future Claims below).



Signature verification is HMAC-SHA256 over the raw request body bytes against \`RAZORPAY\_WEBHOOK\_SECRET\`, compared timing-safe (\`crypto.timingSafeEqual\`, the same construction as \`StaticKeyAuthenticator\`'s API-key comparison) against the \`X-Razorpay-Signature\` header. The raw bytes are captured route-scoped — \`express.raw()\` mounted on this router only, ahead of the app's global \`express.json()\` — never a re-serialization of a parsed body, which is not guaranteed to reproduce the original wire bytes; \`packages/api/tests/unit/webhooks/verify-razorpay-webhook-signature.test.ts\` and the integration suite each include a case proving this specifically (a pretty-printed payload whose \`JSON.stringify\` output differs byte-for-byte from the wire form still verifies).



\`RAZORPAY\_WEBHOOK\_SECRET\` is a third Razorpay credential, isolated the same way as \`RAZORPAY\_KEY\_ID\`/\`SECRET\`: never logged, never placed in an error message or audit record. Fail-closed by construction, not merely by convention: \`resolveRazorpayWebhookSecret.ts\` returns \`undefined\` when unset outside test mode, and \`app.ts\` never mounts the route at all in that case — a request to it 404s (Express's own "no route matches" response), mirroring exactly how the Razorpay connector itself is simply absent from the registry when \`RAZORPAY\_KEY\_ID\`/\`SECRET\` are unset. In test mode, \`RAZORPAY\_TEST\_WEBHOOK\_SECRET\` overrides a built-in placeholder secret; every call site of \`createApp\` must state its \`razorpayWebhook\` choice explicitly (\`"disabled"\` or a real secret+stores triple) — the same no-default discipline \`CallerAuthOption\` already established.



Replay protection is durable and consume-exactly-once, keyed on \`X-Razorpay-Event-Id\`, and structurally mirrors \`@parmana/envelope-verifier\`'s \`NonceStore\`: a single atomic call (\`RazorpayWebhookEventStore.recordIfUnseen\`) does both the "is this a replay?" check and the persist, with no separate check-then-set — in production this is one INSERT into \`razorpay\_webhook\_events\`, whose primary key on \`event\_id\` is the entire atomicity mechanism (identical to \`consumed\_nonces\`/\`SupabaseNonceStore\`); in test mode, an in-memory \`Map\`. Order is enforced in code: the dedupe store is never touched until after the signature has verified and the event id header is confirmed present — the same verify-then-consume reasoning \`EnvelopeVerifier\` already applies to Gateway nonces, applied here to webhook event ids. A dedicated integration test (\`verify-before-consume ordering\`) proves this directly: a forged signature carrying a fresh event id is rejected and the dedupe store remains untouched, and a subsequent legitimately-signed request with that same event id is still accepted as fresh, not as a duplicate.



Response discipline: verified + fresh → persisted, audited (\`webhook.received\`), \`200\` immediately, with no downstream processing inline. Duplicate (already consumed) → \`200\` (acknowledged, never reprocessed), audited as \`webhook.duplicate\`. Bad signature, missing signature header, or a validly-signed request missing the event id header → \`401\`, audited as \`webhook.rejected\` with a short diagnostic reason, body never persisted anywhere. Oversized body (over the 1MB cap) → \`413\`.



Payload handling treats the body as untrusted input even after signature verification: only event id, event type, and payment/refund ids (when extractable from \`payload.payment.entity.id\`/\`payload.refund.entity.id\`) ever reach an audit record — never full payload contents, and never any card/customer field Razorpay's payload may include. An audit record for a request that failed signature verification carries no payload-derived fields at all — the body is never parsed before the signature is confirmed valid.



Evidence



\* packages/api/src/webhooks (RazorpayWebhookEventStore, InMemoryRazorpayWebhookEventStore, SupabaseRazorpayWebhookEventStore, RazorpayWebhookAuditSink, InMemoryRazorpayWebhookAuditSink, SupabaseRazorpayWebhookAuditSink, verifyRazorpayWebhookSignature, RazorpayWebhookTypes)



\* packages/api/src/routes/webhooks-razorpay.ts (the route: verify-then-consume ordering, response discipline, payload-handling rule)



\* packages/api/src/bootstrap/resolveRazorpayWebhookSecret.ts, createRazorpayWebhookEventStore.ts, createRazorpayWebhookAuditSink.ts (test/production split; fail-closed at startup in production when Supabase is unconfigured, mirroring createNonceStore.ts/createCallerAuditSink.ts)



\* supabase/migrations/20260718182238\_add\_razorpay\_webhook\_tables.sql (\`razorpay\_webhook\_events\`, \`razorpay\_webhook\_audit\_events\`; primary-key-as-atomicity mechanism, RLS enabled, no PII)



\* packages/api/tests/unit/webhooks/verify-razorpay-webhook-signature.test.ts — HMAC-SHA256 vectors (valid signature accepted, one-byte body tamper rejected, one-byte signature tamper rejected, wrong-secret rejected, non-hex header rejected without throwing), and the raw-bytes-not-re-serialized proof



\* packages/api/tests/unit/webhooks/in-memory-razorpay-webhook-event-store.test.ts — fresh event recorded; replayed event id rejected as duplicate, original record not overwritten



\* packages/api/tests/unit/bootstrap/resolve-razorpay-webhook-secret.test.ts — test-mode placeholder/override; production fail-closed absence and configured-secret cases



\* packages/api/tests/integration/razorpay-webhook.integration.test.ts — full \`POST /webhooks/razorpay\` HTTP requests against the real app and an inspectable in-memory event store/audit sink: valid signature accepted and persisted; duplicate acknowledged without reprocessing; bad signature rejected with nothing persisted; missing signature header rejected; validly-signed request missing the event id header rejected; verify-before-consume ordering (forged signature + fresh event id never consumes it); raw-bytes proof at the HTTP boundary; \`razorpayWebhook: "disabled"\` mounts no route (404)



\---



\## 3.6 Razorpay Refund Lifecycle Closure (M4b, Scoped)



\`RazorpaySettlementProcessor\` (packages/api/src/webhooks/RazorpaySettlementProcessor.ts) drains M4a's verified, deduplicated pending-events store into signed Settlement Confirmations, closing a Razorpay refund's lifecycle on its correlated Execution Trust Record. This is the first code in this codebase that reads \`razorpay\_webhook\_events\` back to act on anything — M4a's own claim explicitly stopped short of this.



Only \`refund.processed\` and \`refund.failed\` events are acted on; every other event type is acknowledged as ignored and audited, never treated as an error. Correlation extracts the parmana transaction id from the refund entity's \`notes\` tag (the same \`parmana\_txn\` key \`RazorpayConnector.createRefund\` already writes) and looks up the Trust Record. Not found (the webhook can legitimately arrive before the synchronous execution path finishes writing) parks the event with bounded-attempt retry (default 5 attempts, configurable); the window exhausting produces a flagged (elevated-severity) audit event and the event is never reprocessed again — no crash, no infinite loop.



FETCH-VERIFY is load-bearing, not decorative: a webhook is treated strictly as a doorbell, never a delivery. Before any confirmation is written, an authenticated \`razorpay:refund-fetch\` GET (a new capability added to \`RazorpayConnector\` this session, reusing the exact same connector/credential wiring \`razorpay:refund-create\` already uses) confirms the refund's status directly from Razorpay's API. The FETCHED status — never the webhook's own claimed event type — decides \`SettlementConfirmation.status\` (\`SETTLED\` when fetched status is \`"processed"\`, \`SETTLEMENT_FAILED\` otherwise). A webhook claiming \`refund.processed\` whose fetched state is actually \`"failed"\` is recorded as \`SETTLEMENT_FAILED\`; the fetch call itself being unreachable parks and, on window exhaustion, produces a flagged audit event and writes no confirmation at all (fail closed: no unverified closure).



The Settlement Confirmation is a SECOND, independently signed artifact — the original Receipt is never mutated, and neither is the Trust Record's own \`trustRecordHash\`/\`signature\` (\`SettlementConfirmationCrypto\`, structurally identical to \`ReceiptCrypto\`: same \`TrustRecordHasher\`/\`ArtifactSigner\`/\`FileKeyProvider\`/\`DEFAULT_KEY_ID\` composition, so a confirmation is signed exactly the way a Receipt is and its signature verifies with the same \`SignatureVerifier\` used to verify Receipt signatures elsewhere in this document). It references the original Receipt id (when one exists — never a blocking dependency), the business transaction id, the triggering webhook event id, and the fetched refund status. \`ExecutionTrustRecordRepository.appendSettlementConfirmation\` follows the identical append-only pattern as \`appendReceipt\`/\`appendVerification\`/\`appendOverride\` (in-memory and Supabase, the latter backed by a new \`settlement\_confirmations\` table mirroring \`receipts\`'s shape).



A \`SETTLEMENT_FAILED\` confirmation additionally emits a flagged (elevated-severity) audit event, and the read paths never go silent: \`GET /verification/{businessTransactionId}\` surfaces the latest confirmation's status, id, fetched status, and refund id alongside the verification result (a verifier sees "executed, settlement failed," not an unremarked VERIFIED); \`GET /trust-records/{businessTransactionId}\` surfaces the full \`settlementConfirmations\` array as part of the whole record.



Processing is out-of-band from the webhook request cycle by design — M4a's \`200\` has already returned by the time settlement processing runs. Simplest pattern consistent with the codebase: no new queue infrastructure (none existed before this session — see 3.5's own note). \`RazorpaySettlementProcessor.runOnce()\` is a single idempotent drain, callable directly (what the test suite does, deterministically, with no timers) or from a thin poll loop (\`scripts/process-razorpay-settlements.ts\`, a \`setInterval\` calling \`runOnce()\` — no cron, no job-queue dependency added). Idempotency has two independent layers: durably, a confirmation is never written twice for the same webhook event id (checked against the Trust Record itself, safe across restarts); in-process, park-retry attempt counts reset on restart, which is safe precisely because the durable check is what actually prevents a duplicate confirmation.



Live-verified (test mode): the gated live suite (3.4, \`razorpay-live.integration.test.ts\`) was extended with a case that, after creating a real 100-paise refund against the manually captured payment, polls live \`razorpay:refund-fetch\` through the full production \`POST /execute\` chain until Razorpay reports the refund \`"processed"\`, then submits a locally-injected, correctly-signed webhook event (signed with \`RAZORPAY\_TEST\_WEBHOOK\_SECRET\` if configured, else the built-in test-mode placeholder) and drives \`RazorpaySettlementProcessor.runOnce()\` against the real Razorpay API. Run live, this produced a real signed \`SETTLED\` confirmation with \`fetchedRefundStatus: "processed"\`, referencing the real refund id. This proves fetch-verify and settlement closure work end to end against a real Razorpay test-mode account, without a public URL — but it does NOT prove Razorpay itself ever delivered a webhook: the event this test submits is constructed and signed by the test itself, not received from Razorpay's servers (see Future Claims for exactly what closes this gap).



Evidence



\* packages/api/src/webhooks/RazorpaySettlementProcessor.ts (correlation, park/retry with bounded window, fetch-verify, fetched-state-wins confirmation, audit trail, runOnce/processEvent)



\* packages/api/src/bootstrap/createRazorpaySettlementProcessor.ts (fail-closed: undefined when no Razorpay credential is configured, mirroring createConnectorRegistry.ts)



\* scripts/process-razorpay-settlements.ts (the out-of-band poll-loop trigger; \`npm run process:razorpay-settlements\`)



\* packages/shared/src/domain/settlement-confirmation.ts (SettlementConfirmation, SettlementStatus), packages/crypto/src/SettlementConfirmationCrypto.ts (signing, structurally identical to ReceiptCrypto.ts)



\* packages/shared/src/repositories/execution-trust-record-repository.ts (appendSettlementConfirmation), packages/storage/src/memory/MemoryExecutionTrustRecordRepository.ts, packages/storage/src/supabase/SupabaseExecutionTrustRecordRepository.ts, supabase/migrations/20260718190412\_add\_settlement\_confirmations\_and\_audit\_severity.sql (settlement\_confirmations table; widened razorpay\_webhook\_audit\_events type constraint plus severity/confirmation\_id/fetched\_refund\_status columns)



\* packages/connector-sdk/src/connectors/razorpay/RazorpayConnector.ts (new \`razorpay:refund-fetch\` capability, GET /refunds/:id), MockRazorpayServer.ts (GET /refunds/:id simulation, setRefundStatus test hook)



\* packages/api/src/routes/verify-get.ts (settlement surfaced on the verification read path, never silently)



\* packages/api/tests/unit/webhooks/razorpay-settlement-processor.test.ts — processed event through signed, verifier-checked confirmation; failed event through flagged audit; webhook-claims-processed-but-fetch-says-failed (fetched state wins); park-and-retry race resolving once the Trust Record appears; park-window exhaustion (flagged, never reprocessed); fetch-verify unreachable (no confirmation, flagged, no crash); Receipt byte-identical and \`trustRecordHash\`/\`signature\` unchanged after settlement; irrelevant event types ignored, never an error; \`runOnce\` summary counts



\* packages/api/tests/integration/razorpay-settlement.integration.test.ts — full lifecycle through the real app against MockRazorpayServer: \`POST /execute\` creates a mock refund, a simulated correctly-signed webhook is POSTed to the real route, \`runOnce()\` produces a signed \`SETTLED\` confirmation, and \`GET /verification/{id}\` surfaces it



\* packages/api/tests/integration/razorpay-live.integration.test.ts — the money-moving describe block's new case: live poll of \`razorpay:refund-fetch\` to \`"processed"\`, a locally-injected signed webhook, and a live-run \`SETTLED\` confirmation against the real captured payment's real refund



\---



\# 4. Future Claims (Pending Evidence)



The following claims are planned but are intentionally withheld until supported by implementation, testing, audit, and documented proof.



\* \[FUTURE\] Razorpay payout creation (RazorpayX): no implementation exists. The Razorpay connector implemented in this milestone covers refund creation only.

\* \[FUTURE\] Razorpay live-mode operation: every live claim in 3.4 is against Razorpay's test-mode API only. No test in this codebase has ever made a network call against Razorpay live mode, and none is planned — live-mode operation is a deployment/production-configuration concern (\`RAZORPAY\_KEY\_ID\`/\`RAZORPAY\_KEY\_SECRET\` pointing at a live-mode key pair), not something this suite proves.

\* \[FUTURE\] Live Razorpay webhook delivery (real Razorpay-initiated, not locally-injected): every webhook event processed anywhere in this codebase — including 3.6's live-run settlement closure — is constructed and signed by a test, never received from Razorpay's own servers. Proving real delivery requires a public URL Razorpay can reach (e.g. a tunnel during development, or a deployed environment) and, to close the signature-authenticity gap specifically, a captured real payload fixture: a real Razorpay delivery's exact bytes and headers, saved once from the Razorpay Dashboard's webhook delivery log and replayed in a hermetic test — mirroring how docs/guides/e2e captures real request/response pairs elsewhere in this codebase — so the payload-shape assumptions in \`extractSafeMetadata\` (routes/webhooks-razorpay.ts) and \`RazorpaySettlementProcessor\`'s correlation-extraction logic are checked against what Razorpay actually sends, not just what its docs describe or what this codebase's own synthetic payloads assume.

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



