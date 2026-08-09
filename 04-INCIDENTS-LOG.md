# 04 — INCIDENTS & DEFECTS LOG

*Security incidents and latent defects discovered during Sessions 1–8, with resolutions.*
*Snapshot: July 5, 2026. INC-6 and INC-7 added 2026-08-03, from later sessions this log had
not been updated to reflect — this document's own gap, not a new incident; see RFC-0022
(docs/rfcs/RFC-0022-Challenge-Record.md) for the durable, structured record type going
forward. INC-8 added 2026-08-09, for an incident that itself dates from the ML-DSA-65
signature provider work (same gap pattern this note already describes); independently
re-verified against the actual current state of both remotes as part of adding it, not
transcribed from a prior report on faith.*

The pattern worth noting: three of the five arrived from work done **outside the
review loop**, and the test suite (or a review stop-gate) caught each. The recurring
lesson — *full suite green before every commit, whoever produced the change* — is now a
standing rule.

---

## INC-1 — Exposed signing private key (SECURITY, highest severity)

**What:** `keys/default.private.pem` was committed and pushed to the public GitHub repo.
Confirmed downloadable by anonymous clone.

**Impact:** anyone could mint valid signatures. Every signature by that key carried zero
authenticity guarantee while in use.

**Resolution:** treated as permanently compromised. `git rm --cached` + root `.gitignore`
(`keys/`, `*.pem`), rotated to a fresh Ed25519 pair via the hardened keygen script, full
suite re-verified green with the new key, compromise notice added to `docs/CLAIMS.md`.

**Still open:** history purge (`git filter-repo --path-glob '*.pem'` + force-push) and
archiving the sibling `pavancharak/parmana` repo, which has the same exposure.

**Silver lining:** with zero external users, practical damage was nil — the cheapest this
incident could ever be. It is now the lead argument for prioritizing KMS custody (a key
that never leaves the HSM cannot be committed to a repo).

---

## INC-2 — Fake permit hash, released under a version tag (INTEGRITY)

**What:** commit `39c89e9`, tagged `v1.1.0-execution-permit`, added an "execution permit"
whose `transactionHash` was `Buffer.from(canonical).toString("base64")` — the entire
content, reversibly encoded, labeled `"sha256"`, with `createHash` never called. Shipped
with empty stub files, an empty class exported from the public API, and a "tutorial 14"
that was a verbatim copy of tutorial 13.

**Impact:** a counterfeit security primitive on `main`, tagged as a release, that *looked*
like content binding but bound nothing.

**Resolution:** reverted file-by-file with proof, and replaced with the real gateway
(Session 8) — genuine single-sourced canonical hashing.

**Still open:** delete or re-point the `v1.1.0-execution-permit` tag on the remote.

---

## INC-3 — Ephemeral Dilithium3 keys (CRYPTO)

**What:** `Dilithium3SignatureProvider` called `ml_dsa65.keygen()` in its constructor —
a fresh throwaway keypair per instantiation — while its doc comment claimed persistent
keys. Nothing it signed could be verified by any other instance.

**Impact:** with `dilithium3` selected, the entire trust model would silently break —
different ephemeral key per signer, verification impossible across instances/restarts.

**Resolution:** rewritten on native Node 24 `ml-dsa-65` with caller-supplied persistent
PEM keys; cross-instance verification test added; key/algorithm binding guards added to
both providers.

---

## INC-4 — TypeScript bivariance hole (TYPE SAFETY)

**What:** the broken Dilithium3 provider (INC-3) type-checked cleanly despite its methods
having the wrong arity, because TypeScript's parameter bivariance let a
`sign(data)`/`verify(data, sig)` satisfy the `sign(data, key)`/`verify(data, sig, key)`
interface — silently discarding the caller-supplied key.

**Impact:** explains how a broken crypto component sat undetected: the compiler never had
a chance to flag it, and it had zero tests.

**Resolution:** provider rewritten to the correct interface; 20 real crypto tests added
where there had been zero.

---

## INC-5 — `df5d060` return-contract break (REGRESSION)

**What:** a commit changed `Runtime.execute()`'s return shape from the trust record
directly to a `{transaction, context, trustRecord}` wrapper, without updating consumers.

**Impact:** 9 consumers silently broke — 2 tests plus 6 public tutorials and 3 scenario
scripts, several printing the wrong object or crashing. No test noticed, because example
scripts aren't in the suite.

**Resolution:** all consumers updated to the wrapper contract (a one-line destructuring
each); confirmed no externally visible HTTP-API change (routes go through
`ExecutionTrustApplication`, which re-fetches from storage).

**Follow-up on the list:** a CI smoke-run of the example runners, so a contract change
can never again silently break the public-facing walkthroughs.

---

## INC-6 — Signal/Intent binding gap: policy evaluated caller-declared signals never bound to the executed Intent (SECURITY, highest severity)

**What:** `BusinessTransactionMapper.fromRequest` took `policy` and `signals` verbatim from
the client request body, and `PolicyEngine.evaluate` decided APPROVED/REJECTED against
exactly those caller-declared signals. `ExecutableContent` — what `ExecutionGateway`
actually signs and executes — was built from `intent.action`/`intent.target`/
`intent.parameters`, a completely disjoint set of fields. Nothing cross-checked that the
two described the same real-world action. Found via an external adversarial security
exercise, not this project's own internal audit process.

**Impact:** live, reproducible bypass of the core "no unauthorized execution" invariant.
Proof-of-concept: `signals` declared a fully verified, policy-approved $5,000 payment to a
known vendor while `intent` targeted an attacker-controlled account for $999,999,999 —
before the fix, `200`, `APPROVED`, `COMPLETED`, with a real signed Execution Trust Record
and receipt issued for it. A compounding finding from the same session: any caller holding
any valid API key could claim to be any human or role in `authority.principalId`
("impersonate the CEO"), and any authenticated caller could read any other caller's
complete transaction/trust-record/receipt history (IDOR).

**Resolution:** `Policy.boundSignals` (an opt-in signal-key → intent-dot-path map) plus
`SignalIntentBinder`, run immediately before `PolicyEngine.evaluate` over the exact signals
and intent about to be used — a mismatch becomes an ordinary policy REJECT, so no
authorization is ever generated for it. `isPrincipalAllowed` gates `authority.principalId`
against the caller's own grant; `metadata.submittedBy` is now stamped server-side, never
client-supplied; `isOwnedByCaller` scopes every read route. A related path-traversal bug in
`FilePolicyRepository.load` (same unvalidated-input class as an earlier `FileKeyProvider`
finding) was fixed alongside these since it was already well-scoped. Full detail, PoC
figures, and the residual (unbound signals remain caller-declared attestations, not yet
independently re-verified) are in `docs/VERIFICATION-GAPS.md` G-24.

**Verified:** 28 new tests reproducing the exact live exploit shapes (signal/intent
mismatch, principal spoofing, path traversal, cross-caller read), plus positive controls
for legitimate requests; the exploit sequence was re-run via real HTTP against a fresh,
isolated clone with the fix applied and confirmed blocked in every case.

**Update (2026-08-04):** the residual named above ("unbound signals remain caller-declared
attestations, not yet independently re-verified") is now closed for both `razorpay-refund`
and `hubspot-deal-update`, via a new, additive `SignalStateVerifier` port (one capability-
scoped implementation each, combined via `CompositeSignalStateVerifier`) that independently
re-fetches real vendor state before a caller-declared APPROVE is trusted, proven by a
failing-then-passing regression test for each. `vendor-payment` was investigated per-fact and
confirmed genuinely blocked, not merely unattempted: none of its five unbound facts
(`vendorVerified`, `invoiceVerified`, `paymentApproved`, `sufficientFunds`, `riskScore`) has a
real, fetchable source anywhere in this codebase -- every candidate connector (vendor-payment,
SAP, Oracle, Workday) is a write-only, in-memory `MockConnector` explicitly documented as a
placeholder, not a production-capable integration the way Razorpay's and HubSpot's connectors
already are. No code was changed for `vendor-payment`. Separately, the daily-cumulative-cap
ledger TOCTOU race flagged alongside the razorpay-refund residual is also now closed: an
optimistic-concurrency guard (`RazorpayCumulativeRefundLedger
.recordApprovedRefundIfWithinCap`) reserves the ledger slot atomically immediately before the
refund actually executes, rather than reading the total early and writing unconditionally
after success, proven by a concurrent-request regression test confirmed failing (both requests
approved) against the pre-fix code before the fix, then passing after it. Full detail:
`docs/VERIFICATION-GAPS.md` G-24's updates.

---

## INC-7 — Audit-sink events were durable but unsigned (INTEGRITY)

**What:** `caller_audit_events` and `razorpay_webhook_audit_events` (the durable
replacements for the in-memory caller-auth and webhook audit trails, G-13) were plain rows
once written: durable against a process restart, but anyone with direct database access
could alter one afterward with no way to detect it — the same exposure `ExecutionTrustRecord`
had before it carried a signature.

**Impact:** the caller-authentication and Razorpay-webhook audit trails were tamper-evident
against nothing. An altered row (a rejection quietly rewritten to look like a success, or
vice versa) would have been indistinguishable from a genuine one.

**Resolution:** `SupabaseCallerAuditSink` and `SupabaseRazorpayWebhookAuditSink` now sign
every event at write time with `AuditEventCrypto`, the same signing stack and `DEFAULT_KEY_ID`
`ExecutionTrustRecord`/`RefusalRecord` already use — one root of trust, not a third key. A
`signature_json JSONB` column was added to both tables (nullable, additive; existing
unsigned rows stay unsigned, honestly, every row from the migration forward is signed).

**Still open:** shortly after this shipped, Supabase's PostgREST layer got stuck refusing to
recognize `signature_json` in its schema cache on `INSERT` (confirmed at the PostgREST layer
specifically — not the database, not this codebase; PostgREST support ticket SU-437429).
Worked around by writing both sinks via a direct Postgres connection
(`PostgresPoolFactory`), bypassing PostgREST's REST layer and its schema cache entirely —
flagged in both sink files as temporary, revertible once Supabase confirms the cache issue
is resolved.

---

## INC-8 — Exposed Dilithium3 signing private keys on a feature branch (SECURITY)

**What:** four real ML-DSA-65 (Dilithium3) private signing keys (`keys/dilithium3-private.key`,
`packages/api/keys/dilithium3-private.key`, `packages/crypto/keys/dilithium3-private.key`,
`packages/runtime/keys/dilithium3-private.key`) were committed to `feature/pqc-dilithium3` and
pushed to `origin` (`github.com/pavancharak/parmana-exp`) during the ML-DSA-65 signature
provider work. Confirmed present in the pre-purge history (commit `a68c99d`/`e76debd`, "feat(crypto):
add ML-DSA-65 (Dilithium3) post-quantum signature provider" / merge of the same branch),
independently re-derived directly from `main-pre-purge-backup` (a local-only branch retained
specifically to make this incident auditable, never itself pushed anywhere).

**Confirmation nothing live trusted the exposed key:** reported (not independently
re-derivable by this session, since it requires the actual production key material at the
time, which is out of scope for this repository to hold or reconstruct) as confirmed via raw
private-key-byte SHA-256 comparison against the key actually in use — the exposed key did not
match. A fresh Dilithium3 keypair was generated and verified through the real signing chain
regardless, on the same fail-closed discipline as every other key-handling decision in this
codebase: treat exposed material as compromised and replace it, independent of whether
anything can be shown to have actually relied on it.

**Resolution:** history purged via `git filter-repo --path-glob '*.key'` (equivalently scoped
to `.pem`/key material, matching INC-1's own tooling choice), `feature/pqc-dilithium3` deleted,
`main` force-pushed to `origin`.

**Independently re-verified this session, against the actual current state of both remotes —
not taken on the original report's word:**
- `origin`: `git ls-remote --refs` shows no `feature/pqc-dilithium3` and no ref referencing
  `a68c99d`/`e76debd`. A plain fresh clone does not resolve either hash.
- `backup` (`github.com/pavancharak/parmana-exp-backup`, private): **found NOT actually clean**
  during this re-verification — a stray ref, `refs/remotes/origin/feature/pqc-dilithium3`,
  was still live on the remote, pointing directly at `a68c99d`, along with four other
  `refs/remotes/*`-namespaced refs (`origin/HEAD`, `origin/main`, `origin/master`,
  `backup/main`) that should never exist on a remote server at all — apparently pushed
  wholesale from a local working copy's own tracking refs (`--mirror` or `--all`), silently
  undoing the purge on this one remote while `backup`'s actual `refs/heads/main` remained
  clean throughout (confirmed: `a0c725e`'s tree contains none of the four key files). Fixed
  in this session: all five stray refs deleted (`git push backup :refs/remotes/...` for each).
  Re-verified via a fresh, independent bare clone of `backup` immediately after: `git cat-file
  -e a68c99d...` fails (exit 1) — the fresh-clone-unresolvable standard this incident's
  original closure claimed now genuinely holds on both remotes.
- **Residual, not fully closed:** even on `origin`, an explicit `git fetch origin
  a68c99d...` (asking the server for that exact hash directly, not discovering it via any
  ref) still succeeds — GitHub does not guarantee a force-pushed-over commit is truly deleted
  server-side, only that it's no longer advertised or discoverable through ordinary
  clone/browse paths; full removal requires a GitHub support "sensitive data removal"
  request against the repository, not requested as part of this session (out of scope: it
  requires the repository owner's account, not something achievable via `git`). This is a
  known, generic limitation of any GitHub-hosted `git filter-repo` cleanup, not evidence this
  specific purge was done incorrectly.

---

## Minor / dead-code findings (logged, non-urgent)

- `LedgerSerializer.serialize()` — replacer-array misuse silently drops nested payload
  keys. In dead, unreachable code; documented via a behavior test, not fixed.
- Orphaned Replay/Storage subsystems exported but unreachable from the live `/replay`
  route.
- `execution-failure.integration.test.ts` — permanently skipped on a now-stale
  justification; resurrect via the gateway's failure-injection point.
- `.env` sets `DATABASE_PROVIDER=supabase` unconditionally; api repos throw at
  module-import before skip gates run (needs lazy construction).
- `PARMANA_POLICY_DIR` has no repo-relative fallback — fresh clones 500 on execution
  routes.
