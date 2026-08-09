# Tutorial 67 — Razorpay Webhook Receipt

## Objective

Exercise the two real, independent gates every inbound Razorpay webhook delivery must clear: HMAC-SHA256 signature verification over the raw body, and durable eventId-based dedupe — using the actual `verifyRazorpayWebhookSignature` function and `InMemoryRazorpayWebhookEventStore` class directly.

## What You'll Learn

* The signature covers the **raw body bytes**, not a re-serialized parse — verification is HMAC-SHA256(secret, rawBody), timing-safe compared against the `X-Razorpay-Signature` header
* A single tampered byte anywhere in the body invalidates the signature; there's no partial trust
* `recordIfUnseen()` is atomic check-and-persist in one call — no separate "check then set" that could race — and Razorpay's own retry-on-non-2xx behavior means a legitimate event id showing up twice is expected, not an error
* Order matters: the dedupe store is never touched until the signature is proven genuine, so a forged delivery can never burn a real event id

## Running the Tutorial

```bash
npx tsx examples/tutorials/67-razorpay-webhook-receipt/run.ts
```

## Why This Matters

A webhook receiver that trusts its input is a forgeable trigger for real side effects (settlement, refund state changes). This tutorial proves both halves of the real production guard hold: `verifyRazorpayWebhookSignature` rejects anything not signed with the real secret, and `InMemoryRazorpayWebhookEventStore.recordIfUnseen` guarantees a redelivered event is recognized as a duplicate rather than reprocessed.

## Next Tutorial

Continue with **Tutorial 68 – Razorpay Settlement Confirmation**.
