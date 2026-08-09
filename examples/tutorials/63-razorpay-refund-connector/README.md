# Tutorial 63 — Razorpay Refund Connector

## Objective

Execute a real refund through the Razorpay connector, using the same production composition (`createExecutionSystem` + `createApplication`) `server.ts` itself calls, pointed at a hermetic `MockRazorpayServer` instead of Razorpay's live API.

## What You'll Learn

* The full path from a `BusinessTransaction` with `intent.action = "razorpay:refund-create"` through policy evaluation to an actual refund call against the connector
* That approval isn't just a decision — it results in a real (mocked) side effect: a refund record on the Razorpay server, tagged with the originating `businessTransactionId`
* How `NODE_ENV=test` auto-resolves Razorpay credentials to a built-in placeholder, so the tutorial needs no real API key

## Running the Tutorial

```bash
npx tsx examples/tutorials/63-razorpay-refund-connector/run.ts
```

## Why This Matters

A policy engine that only ever produces decisions, never verifiable outcomes, isn't proving much. This tutorial mirrors `packages/api/tests/integration/razorpay-refund.integration.test.ts`'s approved case: a within-cap refund against a captured, matching-currency payment is approved and actually executed, with the refund's `notes.parmana_txn` field linking it back to the transaction that authorized it.

## Next Tutorial

Continue with **Tutorial 64 – Razorpay Policy Denial**.
