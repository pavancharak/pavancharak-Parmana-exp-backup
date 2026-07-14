# Razorpay Connector

## What it does

This connector authorizes and executes Razorpay refunds. It exposes two capabilities:

* `razorpay:payment-fetch`: a read operation, used to fetch the current state of a payment before a refund decision is made.
* `razorpay:refund-create`: the guarded execution. Creates a refund, but only after the razorpay-refund policy pack approves it.

Credentials (`key_id` and `key_secret`) are resolved through the existing session credential vault at execution time and destroyed immediately afterward. Neither value is ever held by the code that decides to request a refund. `key_id` is semi-public and may appear redacted (first 8 characters plus an ellipsis) in receipts and evidence; `key_secret` never appears anywhere.

Before creating a refund, the connector lists existing refunds for the payment and checks whether one is already tagged with the same parmana transaction id, returning it instead of creating a duplicate. Razorpay is not assumed to deduplicate refund requests on its own.

Payout creation (RazorpayX) is not implemented. It is future work only.

## The policy pack

`policies/razorpay-refund/1.0.0/policy.json` is evaluated deterministically, before any refund-creating call is made, against the payment state fetched fresh from Razorpay:

* the payment must exist and have status `captured`
* the currency must be `INR`
* the refund amount must be positive and must not exceed the refundable remainder on the payment
* the refund amount must not exceed the per-refund cap (500000 paise / 5000 INR)
* the day's cumulative authorized amount for the policy scope must not exceed the daily cap (2000000 paise / 20000 INR)

Every denial carries a specific, human-readable reason naming which rule failed.

## How to run tutorial 61

```bash
npx tsx examples/tutorials/61-razorpay-refund/run.ts
```

The tutorial runs entirely against a local mock Razorpay server with fake test-mode credentials, and shows four outcomes: a refund approved and executed, a refund denied by policy, a replayed request returning the recorded result without a second call, and a tampered request rejected before execution.
