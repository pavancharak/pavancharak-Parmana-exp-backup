\# Parmana Roadmap



\*\*Version:\*\* 0.1.0



\*\*Status:\*\* Active



\---



\# Vision



Parmana is an \*\*Execution Trust Infrastructure\*\*.



Its mission is to establish a verifiable trust chain between:



\* Authority

\* Intent

\* Authorization

\* Execution

\* Evidence

\* Verification



The roadmap below defines the implementation order.



\---



\# Phase 1 — Core Foundation



\*\*Status:\*\* In Progress



\## Objectives



Build the immutable domain model.



\### Packages



\* @parmana/core



\### Deliverables



\* Value Objects

\* Domain Objects

\* ExecutionTransaction

\* Serialization

\* Unit Tests



\### Exit Criteria



\* 100% build success

\* Domain tests passing

\* Documentation complete



\---



\# Phase 2 — Runtime



\*\*Status:\*\* Planned



\## Objectives



Implement deterministic execution orchestration.



\### Packages



\* @parmana/runtime



\### Deliverables



\* Runtime

\* RuntimeBuilder

\* RuntimePipeline

\* RuntimeComponent

\* AuthorityStage

\* IntentStage

\* AuthorizationStage

\* ExecutionStage

\* EvidenceStage



\### Exit Criteria



\* Pipeline execution

\* Runtime tests

\* Stage tests



\---



\# Phase 3 — Verification



\*\*Status:\*\* Partially complete



\## Objectives



Implement independent execution verification.



\### Where it lives



Not a separate package. `packages/runtime/src/services/verification-service.ts`,
running on the live execution path. A separate `@parmana/verification`
six-stage pipeline package was scaffolded but never implemented or wired in,
and was retired in Session 5 — see docs/CLAIMS.md.



\### Delivered



\* Integrity verification (recomputed hash vs. stored hash)

\* Signature verification (delegates to @parmana/crypto)

\* Authorization-binding verification (APPROVED executions require an authorizationId)



\### Remaining



\* AuthorityVerifier / IntentVerifier / EvidenceVerifier — not implemented;

  tracked as Future Claims in docs/CLAIMS.md, targeting verification-service.ts



\### Exit Criteria



\* Verification reports

\* Deterministic replay tests



\---



\# Phase 4 — Cryptography



\*\*Status:\*\* Planned



\## Objectives



Provide pluggable cryptographic services.



\### Packages



\* @parmana/crypto



\### Deliverables



\* HashProvider

\* SignatureProvider

\* Provider Registry

\* SHA-256 Provider

\* SHA-3 Provider

\* Ed25519 Provider



\### Future



\* Post-Quantum Providers



\---



\# Phase 5 — Storage



\*\*Status:\*\* Planned



\## Objectives



Persist immutable execution artifacts.



\### Packages



\* @parmana/storage



\### Deliverables



\* Repository Interfaces

\* Memory Storage

\* File Storage

\* Serialization



\---



\# Phase 6 — SDK



\*\*Status:\*\* Planned



\## Objectives



Developer-facing APIs.



\### Packages



\* @parmana/sdk



\### Deliverables



\* Builders

\* Client APIs

\* Utilities

\* Developer Experience



\---



\# Phase 7 — API



\*\*Status:\*\* Planned



\## Objectives



Expose Parmana over HTTP.



\### Packages



\* @parmana/api



\### Deliverables



\* REST API

\* Validation

\* Authentication

\* OpenAPI Specification



\---



\# Phase 8 — CLI



\*\*Status:\*\* Planned



\## Objectives



Developer and administrator tooling.



\### Packages



\* @parmana/cli



\### Deliverables



\* Execute

\* Verify

\* Replay

\* Inspect

\* Export



\---



\# Phase 9 — Enterprise



\*\*Status:\*\* Future



\## Planned Capabilities



\* Policy Engine

\* Human Approval (see "Policy Governance — Future Work" at the end of this document for the maker-checker feature already built, and the further work considered but not yet built)

\* Multi-Tenant Runtime

\* Compliance Packs

\* Audit Dashboard

\* Enterprise Storage

\* Observability

\* HA Deployment



\---



\# Phase 10 — Ecosystem



\*\*Status:\*\* Future



\## Planned Deliverables



\* VS Code Extension

\* Terraform Provider

\* Kubernetes Operator

\* Language SDKs

\* Cloud Integrations

\* Marketplace Integrations



\---



\# Definition of Done



A phase is complete when:



\* Implementation is complete.

\* Tests pass.

\* Documentation is updated.

\* Conformance requirements are satisfied.

\* ADRs are updated if required.



\---



\# Guiding Principle



Implementation follows Architecture.



Architecture follows Execution Trust.



Execution Trust remains the primary design objective for every phase of the Parmana platform.

---

## Policy Governance — Future Work (Not Yet Built)

Candidate future work for the maker-checker Policy Governance feature (see `docs/CLAIMS.md` §2.26 for what is built and proven today). None of the items below are committed, scheduled, or in progress — this section records considered-but-deferred ideas, not a plan.

### Three-role flow (Maker → Reviewer → Approver)
**Problem it would solve:** the current model is two roles (maker, checker); a stakes-gated third role (an intermediate Reviewer) would let higher-risk policy changes require broader sign-off than a single checker, without forcing that overhead onto every change.
**Why not built:** not required at current stage/scale — the existing single-checker maker≠checker model (`SameActorCannotApproveOwnChangeError`, `packages/api/src/routes/pending-policy-changes.ts`) already closes the gap this feature exists to close. Would need product decisions (which changes are "high-stakes," how a Reviewer's authority differs from an Approver's) before implementation makes sense.

### Freeze/escalation on repeated non-human-caller attempts
**Problem it would solve:** today, a denied non-human-caller attempt on a governance endpoint is logged (`caller.non_human_denied`, fail-closed — `requireHumanCaller()` in `pending-policy-changes.ts`) but has no consequence beyond that single request being denied; repeated attempts from the same caller produce repeated log entries, not an escalating response.
**Why not built:** no automated response to a pattern of denied attempts exists yet. Would require deciding what "freeze" means operationally (freeze the caller's credential? the specific policy? notify a human?) and isn't urgent while attempt volume is low enough for a human to review the audit log directly.

### WORM/immutable storage for approved policy content and approval records
**Problem it would solve:** `policy_change_approval_records` (`supabase/migrations/20260818120000_add_policy_governance_tables.sql`) is an ordinary Postgres table under RLS — application code never issues `UPDATE`/`DELETE` against it, but nothing at the storage layer prevents a sufficiently privileged operator (e.g. via `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS) from doing so. True write-once/read-many storage, or an external anchor (e.g. a hash notarized outside the database), would remove that operator-trust requirement.
**Why not built:** the current signed-record model already gives tamper *detection* — the deploy/startup integrity check (`verifyPolicyGovernanceIntegrityAtStartup.ts`) and the CI gate (`scripts/verify-policy-changes-approved.ts`) both compare live content against the record's signed hash — even without tamper *prevention*. Genuine WORM/immutability is a larger infrastructure decision (which storage layer, what the anchor is) not yet made.

### Tiered approval: mobile biometric approval + enforced diff-review UX + two-person approval for high-stakes changes
**Problem it would solve:** the current step-up mechanism is a single signed envelope from a key the checker holds on a device with no AI agent access (see CLAIMS.md §2.26's open questions). A tiered model would let low-stakes changes use lighter-weight approval while reserving stronger guarantees (biometric-bound approval, mandatory diff review, two independent human approvers) for changes judged high-stakes.
**Why not built:** depends on defining "high-stakes" for a policy change, and on the open question below — building a tiered mobile-approval UX for Parmana-internal governance is premature if the eventual answer is that policy authoring moves external to Parmana entirely.

### Open question this future work depends on: Parmana-internal vs. external policy authoring
Several items above (three-role flow, tiered approval, WORM storage for approval records specifically) only make sense to build if Parmana's own maker-checker system remains the system of record for policy approval. The alternative — policies authored and approved in an external system, with Parmana staying read-only/enforcement-only for policy content — would make some of this work unnecessary and reshape the rest (verifying an external approval's provenance, rather than producing one). This is a genuinely open design question (see `docs/CLAIMS.md` §2.26) that should be resolved before investing further in any of the above.


