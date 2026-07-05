# 02 — REMAINING

*The full forward roadmap. Snapshot: July 5, 2026.*

Progress against the original vision: **~40% of the code, ~80% of the credibility** —
the provability layer is done; what remains is the unavoidability layer.

---

## Tier 0 — Immediate (days; mostly your side)

- [ ] **Close Session 8**: resolve the duplicated-`executableContent`-extraction deviation
      (consolidate to the single shared derivation, or prove drift is impossible with a
      cited test); apply the full CLAIMS.md set — corrected §2.16 (with the "requests that
      bypass the Gateway are not covered" clause), §3.3 sole-release-boundary, and the D2
      migration note.
- [ ] **Git hygiene / history purge**: `git filter-repo --path-glob '*.pem' --invert-paths`
      + force-push; delete or re-point the `v1.1.0-execution-permit` tag (advertises the
      reverted counterfeit hash); archive or make-private the old `pavancharak/parmana`
      repo — but first rescue its `policies/` directory into `parmana-exp` and update `.env`
      (local `.env` currently points `PARMANA_POLICY_DIR` at the old repo).
- [ ] **Record the 5-scenario demo** from example 04 — the design-partner opener.

---

## Tier 1 — Near-term code (1–3 weeks)

- [ ] **Micro-session — fresh-clone correctness**: `PARMANA_POLICY_DIR` needs a
      repo-relative fallback (execution routes currently 500 on a bare clone); make
      Supabase repository construction lazy/config-guarded (currently throws at
      module-import before skip gates run — the hermetic exemption needs a dual env
      override to work).
- [ ] **Session 6 — Authority / Evidence check design** (Intent is already DONE — the
      gateway's content binding *is* intent verification). Open honest question from the
      investigation: does an Authority check verify anything the signature check doesn't,
      before a key/authority registry exists? If not, Authority moves behind the KMS
      work and is not kept as vaporware.
- [ ] **Cleanup remnants**: orphaned Replay/Storage subsystems
      (`ReplayExecutor`/`ReplayPipeline` → `StorageEngine`/`AppendOnlyLedger`, unreachable
      from the live route); the `LedgerSerializer` replacer-array bug (dead code);
      resurrect `execution-failure.integration.test.ts` now that the gateway provides a
      clean failure-injection point.
- [ ] **Session 8-KMS Phase 1** — investigation only (interface impact of KMS-holds-the-key,
      which algorithms KMS supports, test strategy without live AWS in CI). The
      key-exposure incident is the business case.

---

## Tier 2 — The big rocks (months; the future-tense claims)

Each converts one currently-future claim into present tense.

- [ ] **KMS / HSM key custody** (~1–2 wks after investigation)
      → *"Parmana's signing key cannot be exfiltrated from the application process."*
      Also retroactively hardens every existing signature claim, and closes the incident
      class that produced the key exposure.

- [ ] **Credential brokering — one system class, AWS STS first** (~4–8 wks; shape with a
      design partner) → *"For [action class] on AWS, AI never possesses execution
      credentials."* This is the architectural leap from "authorizes with proof" to
      "AI cannot act alone." Extending the envelope with resource/action fields is a
      signed-artifact schema change — a dedicated versioned session, never a rider.

- [ ] **Reference deployment + bypass detection** (per-deployment; needs a partner's red
      team) → *"Non-bypassable per integrated system under the reference deployment;
      bypass detected everywhere."* Includes network-policy templates and a reconciliation
      loop comparing downstream activity against issued authorizations. The unscoped
      "non-bypassable, period" stays permanently unclaimable (break-glass/legacy paths).

- [ ] **Nonce store persistence** (Redis/Supabase-backed `NonceStore`)
      → fleet-wide single-use, beyond per-process. TTL bounds the persistence window.

---

## Tier 3 — Business track (parallel, not code)

- [ ] Update the deck to "with proof" positioning; retire the forbidden phrasings AND the
      now-dead "six-stage verification pipeline" language.
- [ ] Brief Mohinder & Abhigna from `docs/CLAIMS.md` — especially the mandatory
      conditional-clause rule (partnerships conversations are where claims get rounded up).
- [ ] **Start design-partner conversations now** — do not wait for the code. Session 9
      (credential brokering) should be shaped against a real partner's workflow, so the
      partner search is itself a prerequisite for the next big code rock.

---

## The permanent ceiling (never claimable, and say so proudly)

- **"Non-bypassable, period"** — break-glass, SSH, vendor consoles, and legacy static
  credentials are load-bearing enterprise requirements, not gaps. Ceiling forever:
  "non-bypassable per integrated system under the reference deployment."
- **"Universal"** — credential brokering is per-system-class; each integration is earned.
- **"The policy is correct"** — Parmana proves rules were followed, never that they were
  wise. Stating this openly is what makes everything else believable.

---

## Suggested order

Tier 0 → micro-session (fresh-clone correctness) → Session 6 (Authority/Evidence design)
→ cleanup remnants → KMS Phase 1 → KMS build → **partner conversations running in
parallel throughout** → credential brokering shaped by a real partner → reference
deployment proven by their red team.
