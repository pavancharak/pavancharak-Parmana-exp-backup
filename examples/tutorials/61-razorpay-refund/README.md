\# Tutorial 61: Razorpay Refund Connector

\## Objective

In this tutorial, you'll authorize and execute a Razorpay refund against a local mock Razorpay server: a deterministic policy pack evaluates the fetched payment state before any refund is created, a signed authorization and the existing Execution Gateway pipeline carry the request to the connector, and a receipt records the outcome. You'll see all four outcomes a design partner would want proven: approval and execution, denial by policy, replay returning the recorded result without a second call, and rejection of a tampered request.

\---

\## What You'll Learn

\* Fetch a Razorpay payment and evaluate the razorpay-refund policy pack against its state

\* Execute a refund through the signed-authorization / Execution Gateway / SessionCredentialSecureConnector pipeline, unmodified from earlier milestones

\* See a refund denied with a specific, human-readable reason

\* Confirm a repeated request with the same transaction id returns the recorded receipt with no second HTTP call

\* Confirm a request tampered after signing fails businessTransactionHash verification and is never executed

\---

\## Architecture

```text

RazorpayRefundService.requestRefund()

&#x20;       │

&#x20;       ▼

outcome cache (by parmana transaction id): replay short-circuits here

&#x20;       │

&#x20;       ▼

razorpay:payment-fetch  →  Execution Gateway  →  RazorpayConnector  →  mock Razorpay server

&#x20;       │

&#x20;       ▼

PolicyEngine.evaluate(razorpay-refund policy, signals)

&#x20;       │

&#x20;       ▼

razorpay:refund-create  →  Execution Gateway  →  RazorpayConnector (list-refunds idempotency check, then create)

```

\---

\## Running the Tutorial

```bash

npx tsx examples/tutorials/61-razorpay-refund/run.ts

```

\---

\## Expected Output

```text

==================================================

Tutorial 61 - Razorpay Refund Connector

==================================================



Outcome 1 - Approved and Executed

\--------------------------------------------------

Approved         : true

Razorpay Refund  : rfnd\_...

Amount (paise)   : 250000

Policy Reason    : Refund authorized. Payment status, currency, refundable remainder, per-refund cap, and daily cumulative cap requirements were satisfied.

Key ID (redacted): rzp\_test...



Outcome 2 - Denied by Policy

\--------------------------------------------------

Approved      : false

Matched Rule  : reject-payment-not-captured

Reason        : Refund rejected because the payment status is not captured.



Outcome 3 - Replay Returns Recorded Result

\--------------------------------------------------

Replayed              : true

Same Refund Returned  : true

Refunds On Razorpay   : 1 (unchanged from 1)



Outcome 4 - Tamper Rejected

\--------------------------------------------------

Rejected      : true

Reason        : Execution Gateway rejected request: failed checks \[businessTransactionHashMatches, nonceUnseen]. businessTransactionHash mismatch: expected ..., got ....



==================================================

Tutorial completed successfully.

==================================================

```

\---

\## Why This Matters

A refund is money leaving the business, so the bar for this connector is that a skeptical reader can trust both the code and the receipt. Policy evaluation runs before any refund-creating call is made, on state fetched fresh from Razorpay rather than trusted from the caller. key\_secret is resolved only inside the existing session credential vault, at execution time, and is destroyed immediately afterward by the existing try/finally pattern. It never reaches this tutorial's own code. Replay of the same transaction id is answered from a local cache before any network call is made at all, and Razorpay's own refund list is checked before every create call as a second, independent idempotency guard.

\---

\## Scope

This tutorial covers refund creation only. Payout creation (RazorpayX) is not implemented and is not demonstrated here.
