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



\* packages/envelope-verifier/test/envelope-verifier.test.ts — "a forged envelope does not burn the nonce", "an expired envelope does not burn the nonce", "rejects a second use of the same nonce"



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

\* packages/runtime/test/verification-service.test.ts — all 6 cases

\* packages/api/test/verification-negative.integration.test.ts — "reports FAILED when the persisted record is tampered after execution"



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



Single-use enforcement of an authorization's nonce is scoped to whichever NonceStore instance performs the check. If multiple independent receiving systems, or multiple instances of the same system, each use their own NonceStore, the same authorization can be accepted once per instance. Fleet-wide single-use requires every instance to share one persistent NonceStore. MemoryNonceStore additionally loses all state on process restart; because every envelope carries a short, bounded TTL, the exposure window created by either gap is bounded by that TTL, not unlimited.



Evidence



\* NonceStore / MemoryNonceStore

\* packages/envelope-verifier/README.md ("Claims", "PRODUCTION WARNING: MemoryNonceStore")



\---



\# 4. Future Claims (Pending Evidence)



The following claims are planned but are intentionally withheld until supported by implementation, testing, audit, and documented proof.



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



