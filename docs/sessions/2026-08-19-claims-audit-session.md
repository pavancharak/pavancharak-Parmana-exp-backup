# Session note — Claims audit remediation (2026-08-19)

A series of "Phase N" prompts asked for fixes to specific `docs/CLAIMS.md` claims. This
repository's own claims are numbered `2.x` (Supported Technical Claims) / `3.x` (Conditional
Claims), not "Claim 1" / "Claim 4" / etc. — every phase's actual first step was mapping the
prompt's claim reference onto the real section, then verifying the prompt's stated file paths,
test names, and code behavior against the repository before changing anything.

---

## Verified and changed

**GitHub connector wired into production execution chain, credential-isolation pattern proven
across two credential models (§3.17, cross-referenced from §3.10's "Claim 1").**

- Code: `packages/execution-gateway/src/connector-execution/GatewayGitHubAdapter.ts`,
  `GitHubAppCredentialProvider.ts`, `createGatewayGitHubConnector.ts`,
  `createGatewayGitHubCredentialProvider.ts` (the last of these new — the factory existed
  only in the package's internal barrel before this session, never on its public `index.ts`);
  `packages/api/src/bootstrap/createGitHubConnector.ts`, `createGitHubCredentialProvider.ts`
  (new); `packages/connector-github/src/GitHubMetadata.ts` (new).
- Tests: `packages/connector-github/tests/unit/GitHubAppJwt.test.ts` (4),
  `packages/execution-gateway/tests/unit/github-connector.test.ts` (12),
  `github-app-credential-provider.test.ts` (6) — 22 hermetic unit tests, pre-existing
  scaffolding from before this session, still passing;
  `packages/api/tests/integration/github-pr-merge.integration.test.ts` (4, new this session);
  `packages/api/tests/integration/github-pr-merge-live.integration.test.ts` (2, new, gated
  behind `ALLOW_LIVE_GITHUB=1`, confirmed to skip cleanly — not run live; `.env`'s
  `GITHUB_APP_PRIVATE_KEY` is 32 characters, not a real PEM key).
- Commits: `e0ba416` (wiring + tests), `64ca169` (§3.17 + §3.10 cross-reference).

**Deployment infrastructure requirements documented (§3.18, new section — no prior claim
existed to correct).**

- Grounded in `DEPLOYMENT.md`, `Dockerfile`, `assertStorageConfigured.ts`,
  `assertSigningKeyMaterialConfigured.ts` — not `docker-compose.yml`/`schema.sql`/a keygen
  CLI, none of which exist in this repository.
- Commit: `38d0b4b`. Documentation only, no code change.

**Policy-governance CI check documented; branch-protection attempt made and its result
recorded (§2.26).**

- `scripts/verify-policy-changes-approved.ts` and `.github/workflows/ci.yml`'s
  `verify-policy-approvals` job already existed and were already fail-closed (exit 1 on any
  unapproved file *or* any failure to complete the check) — real, but not previously cited as
  evidence in `§2.26`; added.
- Attempted to enable GitHub branch protection on `main` (`gh` admin-authenticated,
  `PUT /repos/.../branches/main/protection`) — failed with a live `403 Upgrade to GitHub Pro
  or make this repository public to enable this feature`. Branch protection is not available
  on a private repo under this account's current GitHub plan. Not worked around (would require
  a paid-plan upgrade or making this proprietary, evaluation-only repo public — both
  account-level decisions, neither made this session).
- Commit: `8b515ff`.

---

## Investigated, nothing changed (already correct or already resolved)

**Actor-agnostic authorization at the HTTP boundary — already validated before this session,
as `§2.24`.** The requested new test (`actor-agnostic-authorization.integration.test.ts`,
comparing a named "human" vs. "AI" caller) was not created — `§2.24`'s existing
`packages/api/tests/integration/authority-type-agnostic-execution.integration.test.ts` already
proves the stronger property (identical `POST /execute` outcomes across a conventional
`authorityType` and an arbitrary, not-in-the-enum string, not merely two named categories),
already at `§2` ("Supported"), the document's highest tier. No commit.

**Refusal-record fail-open behavior — proposal to make it fail-closed/atomic was considered
and rejected.** `packages/runtime/src/RuntimeEngine.ts`'s `writeRefusalRecord` (lines 541–596)
is deliberately fail-open, by its own comment ("the single most important property in this
method... the refusal itself must never depend on its own evidence being writable"), backed by
`packages/runtime/tests/unit/refusal-record-fail-open.test.ts`. Making it fail-closed would not
strengthen the property that matters (the request is already unconditionally denied before the
evidentiary write runs) and would introduce a real regression: a storage outage turning a
correct `403` into an opaque `500` — an availability/DoS surface with no corresponding security
gain. Documented in `§3.11` as considered-and-rejected, with reasoning, so it isn't silently
reconsidered later without this context.

- Commit: `15071b6`.

---

## Commits this session

```
15071b6 docs(claims): record and reject the atomic/fail-closed refusal-record proposal
8b515ff docs(claims): document §2.26's CI policy-governance check and its real Git-enforcement gap
38d0b4b docs(claims): add §3.18 deployment infrastructure requirements
64ca169 docs(claims): add §3.17 GitHub PR-merge connector, cross-reference from §3.10
e0ba416 feat(connector-github): wire GitHub connector into the production execution chain
```

All local as of this note. `git log --oneline -6` is the source of truth for this list, not
this document — re-check before relying on it if time has passed.

---

## Verification protocol for future claim-fix requests

Every phase in this series after the first required correcting at least one fabricated
specific (a claim heading that doesn't exist, a file that doesn't exist, a test filename that
doesn't exist, or — twice — a commit hash that was never created). Before acting on a future
"fix Claim N" request against this repository:

1. **Identify the claim by wording, not number.** `docs/CLAIMS.md` uses `2.x`/`3.x` section
   numbers, not "Claim N". Grep for the concept; don't search for a heading that won't exist.
2. **Read every referenced file before trusting it's there.** Grep/Read it. Confirm the claim
   about its content is accurate, not just that the path resolves.
3. **Read the code's own comments before assuming a gap is a bug.** A fail-open, fail-closed,
   or similarly deliberate-looking pattern usually has a reason stated right next to it, and
   often a dedicated regression test. A "fix" that inverts deliberate, tested behavior needs a
   correctness/security argument, not just a plausible-sounding label like "atomic" or
   "fail-closed" — those words don't automatically make a change safer.
4. **Re-derive facts for any summary from source, not from a prior draft.** `git log
   --oneline` for commit hashes; `find`/`ls` for file paths and names. Never carry forward a
   citation without checking it, even one written earlier in the same session.
5. **Treat GitHub/infra-level asks as needing explicit confirmation, and actually attempt them
   live** (e.g. via `gh api`) rather than assuming a written plan's checkbox is achievable —
   real platform constraints (a plan limit, a permission scope) only surface by trying.
