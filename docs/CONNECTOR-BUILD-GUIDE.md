# Connector Build Guide

Distilled from the Razorpay refund connector (built with incidents, fixed after the fact) and the HubSpot deal-update connector (built clean, incidents avoided proactively). Read this before starting any new connector.

## 1. Scope to one narrow action first

Don't build a general-purpose connector for a whole API surface. Razorpay started with refunds only, not payouts, subscriptions, or the full payments API. HubSpot started with one property update on one object type (Deal `dealstage`/`amount`), not Contacts, Companies, or any other object. Widen scope in a later milestone, once the first one is fully proven.

## 2. Build these two guards in from day one, don't retrofit them

Both of these were real incidents on the Razorpay connector, discovered and fixed after the fact. Build them into every new connector's first version instead:

- **Placeholder-credential guard.** The connector must refuse to send a built-in test-mode placeholder credential to the real API before any network call. Don't rely on the real API happening to reject it — that's an accident of the vendor's behavior, not something this codebase controls.
- **No bridge/alias env variables.** Read the documented test credential env variable name directly (e.g. `TEST_HUBSPOT_PRIVATE_APP_TOKEN`). Never introduce an intermediate bridge variable with a different word order or naming convention that can silently drift out of sync with what's documented in `.env.example`.

## 3. Apply SignalIntentBinder-style bound-signals hardening proactively

Don't wait for an adversarial-testing session to find a signal/intent mismatch vector. Bind proposed values (e.g. `proposedDealStage`, `proposedAmount`) to their corresponding request parameters from the policy's first version.

## 4. Test order, every time

1. Hermetic first — full authorize→verify→execute→confirm chain against a mock server, zero network calls.
2. Policy-denial-makes-zero-calls, proven at two layers: a direct state check against the mock server (nothing changed), and a fetch-spy at the API boundary (zero calls reached the real or mock endpoint).
3. Gated live suite last, behind an `ALLOW_LIVE_<CONNECTOR>=1` flag, skipped by default.

## 5. Prefer a non-destructive live test action

Where the target system allows it, use a nudge-then-revert pattern (read live, apply a small reversible change, verify independently, revert) rather than an irreversible action. This lets the live suite be rerun repeatedly without depleting or permanently altering real state — unlike Razorpay's refund, which is irreversible and depletes the test payment's remainder on every live run.

## 6. Disclose bugs plainly, including when the mechanism catches your own mistake

If something fails during a live-test session, document what actually happened in CLAIMS.md, including whether it was a real defect in the connector or the safety mechanism correctly catching an error in the test itself. The HubSpot connector's first live amount-test run failed 403 because the test fixture omitted a required signal — that was `SignalIntentBinder` working correctly, not a bug in the connector, and it's documented as such rather than glossed over.
