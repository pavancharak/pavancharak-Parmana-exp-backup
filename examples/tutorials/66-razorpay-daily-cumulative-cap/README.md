# Tutorial 66 — Razorpay Daily Cumulative Cap

## Objective

Build a day's refund total up to just under the `razorpay-refund` policy's 2,000,000-paise daily cumulative cap, then fire two concurrent refund requests for the remaining headroom — and confirm the atomic `RazorpayDailyRefundLedger` lets exactly one through, never both.

## What You'll Learn

* `dailyCumulativeAfterThisRefundPaise` isn't trusted from the caller — `RazorpayDailyRefundLedger.reserve()` derives the real running total itself, atomically
* Two concurrent requests that both optimistically declare "I'll be the only one" can't both be right: the ledger's atomic `reserve()` serializes them, so the actual outcome depends on which one it resolves first — which is why this tutorial reports the winner generically ("Request A" or "Request B") rather than asserting a fixed one
* The loser isn't rejected for exceeding the cap in isolation — it's rejected because its *declared* total no longer matches the *real* one once the winner's reservation is counted

## Running the Tutorial

```bash
npx tsx examples/tutorials/66-razorpay-daily-cumulative-cap/run.ts
```

## Why This Matters

This is TD-23's Phase 3B closure: without an atomic reservation, two concurrent refunds could both read the same pre-refund total, both decide they're within cap, and both get approved — silently blowing through the daily limit by a full refund's worth. `InMemoryRazorpayDailyRefundLedger`'s single-threaded, read-then-write-atomic `reserve()` (proven directly in its own unit test under 50-way concurrent load) is what makes "only one wins" a guarantee rather than a probability. This tutorial exercises that guarantee through the real end-to-end pipeline, not just the ledger in isolation.

## Next Tutorial

Continue with **Tutorial 67 – Razorpay Webhook Receipt**.
