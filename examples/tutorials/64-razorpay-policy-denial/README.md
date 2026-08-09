# Tutorial 64 — Razorpay Policy Denial

## Objective

Submit a refund request that exceeds the payment's actual refundable remainder, and confirm policy rejects it — with zero refund calls ever reaching the connector.

## What You'll Learn

* A rejection is a first-class outcome of the same real pipeline Tutorial 63 used to approve — not a separate code path
* The mock server's own state is the proof: after a denial, `refundsFor(paymentId)` is empty, not just that the returned decision says "REJECTED"
* `ExecutionGate` throws (status 403, code `POLICY_DENIED`) rather than returning a rejected trust record — the same shape `POST /execute` turns into an HTTP 403

## Running the Tutorial

```bash
npx tsx examples/tutorials/64-razorpay-policy-denial/run.ts
```

## Why This Matters

Approval-only demonstrations prove nothing about the boundary that actually matters. This tutorial mirrors the denial case in `packages/api/tests/integration/razorpay-refund.integration.test.ts`: a refund request for more than what's left refundable on the payment is rejected by the `razorpay-refund` policy's per-refund-remainder rule, and the (mock) Razorpay server's own refund ledger for that payment stays empty — the strongest available evidence that denial actually stopped the side effect, not just the reported outcome.

## Next Tutorial

Continue with **Tutorial 65 – Razorpay Signal-State Verification**.
