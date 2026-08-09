# Tutorial 65 — Razorpay Signal-State Verification

## Objective

Show that a caller's declared signals are never trusted on their own — `RazorpaySignalStateVerifier` independently fetches the real payment from Razorpay and rejects any request whose declared facts disagree with it.

## What You'll Learn

* Nothing stops a caller from declaring `paymentStatus: "captured"` on a payment that's really only `"authorized"` — the transaction schema doesn't prevent it, so something else must catch it
* `RazorpaySignalStateVerifier` fetches the payment itself (`razorpay:payment-fetch`) and compares the result against every one of the policy's verified signal keys before policy evaluation ever runs
* The rejection names the exact mismatch (`paymentStatus="captured" != verified paymentStatus="authorized"`), not a generic denial

## Running the Tutorial

```bash
npx tsx examples/tutorials/65-razorpay-signal-state-verification/run.ts
```

## Why This Matters

This is the G-24 residual closure (RFC-0022): a policy engine that evaluates rules only against caller-declared signals is trivially defeated by a caller who simply declares favorable signals. `RazorpaySignalStateVerifier` closes that gap for the Razorpay connector by re-deriving the same facts from a real, independent fetch — signed with the runtime's own key, going through the same connector every other Razorpay call does — and refusing to proceed on any disagreement, fail-closed.

## Next Tutorial

Continue with **Tutorial 66 – Razorpay Daily Cumulative Cap**.
