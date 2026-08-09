# Tutorial 85 — Razorpay Real Webhook Fixture

## Objective

Replay a real, Razorpay-initiated webhook delivery — not a synthetic, self-signed payload this codebase constructed itself — through the actual `POST /webhooks/razorpay` route and `RazorpaySettlementProcessor`, proving the real field shape Razorpay sends satisfies every parsing and correlation assumption this codebase makes.

## What You'll Learn

* Every other webhook tutorial (67, 68) proves acceptance against a payload this codebase built itself; this one proves the same code against bytes Razorpay's own webhook infrastructure actually delivered
* The fixture is a real capture (2026-07-19, via a temporary local tunnel registered as a Test Mode endpoint, triggered by a real refund through this codebase's own production `POST /execute` chain) with PII redacted — see `packages/api/tests/fixtures/razorpay-webhook-real-delivery.ts`'s header comment for exactly what was redacted and why the signature is a fresh, fixture-only HMAC rather than Razorpay's original
* The real payload's `payment`+`refund` sibling structure under `payload` — not something this codebase invented — is exactly what both the webhook route's `paymentId`/`refundId` extraction and the settlement processor's correlation logic expect

## Running the Tutorial

```bash
npx tsx examples/tutorials/85-razorpay-real-webhook-fixture/run.ts
```

## Why This Matters

A test suite built entirely from payloads the codebase itself constructs can silently drift from what the real third party actually sends — every assumption gets to be "correct" by construction. This tutorial closes that gap: the real delivery's shape is parsed, correlated to a business transaction, and settled successfully, proving the assumptions hold against ground truth, not just against this codebase's own idea of what Razorpay sends.

## Next Tutorial

Continue with **Tutorial 86 – Gateway Attestation**.
