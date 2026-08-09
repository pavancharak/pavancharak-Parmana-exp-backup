# Tutorial 68 — Razorpay Settlement Confirmation

## Objective

Prove that `RazorpaySettlementProcessor` treats an inbound webhook as a doorbell, not a delivery: it always independently re-fetches the refund from Razorpay, and the fetched status — never the webhook's own claimed event type — decides the signed `SettlementConfirmation` it produces.

## What You'll Learn

* A verified, deduplicated webhook event (Tutorial 67's output) is still not enough on its own to settle anything — `processEvent()` performs its own fetch-verify call before signing any confirmation
* When the webhook claims `refund.processed` but Razorpay's own fetched refund status is `"failed"`, the confirmation still comes out `SETTLEMENT_FAILED` — the fetched fact wins every time
* Every `SettlementConfirmation` is signed and independently verifiable with nothing but the artifact and the public key — the same verification technique Tutorial 55 uses for receipts

## Running the Tutorial

```bash
npx tsx examples/tutorials/68-razorpay-settlement-confirmation/run.ts
```

## Why This Matters

Webhooks are attacker- and third-party-influenced input: a delayed, replayed, or simply wrong delivery must never be able to forge a settlement outcome. This tutorial exercises the real `RazorpaySettlementProcessor.processEvent()` against two scenarios — genuine agreement and a deliberate webhook/reality mismatch — and both times, the same real Razorpay fetch (via `MockRazorpayServer`) is what actually determines the signed outcome.

## Next Tutorial

Continue with **Tutorial 69 – HubSpot Deal Update Connector**.
