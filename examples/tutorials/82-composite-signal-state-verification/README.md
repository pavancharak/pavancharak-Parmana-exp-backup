# Tutorial 82 — Composite Signal-State Verification

## Objective

Show how `CompositeSignalStateVerifier` composes multiple capability-scoped verifiers — Tutorial 65's `RazorpaySignalStateVerifier` and Tutorial 71's `HubSpotSignalStateVerifier` — into the single verifier `RuntimeEngine` actually accepts, with no cross-contamination between them.

## What You'll Learn

* `RuntimeEngine` accepts exactly one `SignalStateVerifier`, but a real deployment needs one independent verifier per connector — `CompositeSignalStateVerifier` queries each in turn and returns the first non-empty result
* Each verifier is disciplined to recognize only its own action(s): `RazorpaySignalStateVerifier` returns no violations for a `hubspot:deal-update` request, and vice versa — a mismatched signal on the "wrong" verifier's action is silently ignored by that verifier, not misreported
* An action neither verifier recognizes (`payments:execute`) produces no violations at all — the composite doesn't invent false positives for capabilities it has no verifier for

## Running the Tutorial

```bash
npx tsx examples/tutorials/82-composite-signal-state-verification/run.ts
```

## Why This Matters

Without this discipline, adding a new connector's signal-state verifier could risk one connector's checks leaking into another's requests, or a shared verifier interface forcing an awkward monolith. This tutorial proves the real `CompositeSignalStateVerifier` — the exact class `application.ts` wires Razorpay's and HubSpot's verifiers through in production — routes each request to precisely the verifier that understands it, nothing more.

## Final Tutorial

This is the last of the 20 connector, security-hardening, and platform tutorials (63–82) added alongside the original 01–62. Run `npm run examples` to execute the complete suite.
