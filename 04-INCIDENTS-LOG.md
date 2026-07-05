# 04 — INCIDENTS & DEFECTS LOG

*Security incidents and latent defects discovered during Sessions 1–8, with resolutions.*
*Snapshot: July 5, 2026.*

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
