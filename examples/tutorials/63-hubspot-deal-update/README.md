\# Tutorial 63: HubSpot Deal Update Connector

\## Objective

In this tutorial, you'll authorize and execute a HubSpot Deal update — `dealstage` and `amount` in the same action — against a local mock HubSpot server: a deterministic policy pack evaluates the proposed stage transition and amount change before any update is executed, a signed authorization and the existing Execution Gateway pipeline carry the request to the connector, and a receipt records the outcome. You'll see the same four outcomes Tutorial 61 demonstrated for the Razorpay refund connector: approval and execution, denial by policy, replay returning the recorded result without a second call, and rejection of a tampered request.

\---

\## What You'll Learn

\* Update a HubSpot deal's `dealstage` and `amount` in one guarded action, evaluated against the hubspot-deal-update policy pack

\* Execute the update through the signed-authorization / Execution Gateway / SessionCredentialSecureConnector pipeline, unmodified from earlier milestones

\* See a dealstage transition denied with a specific, human-readable reason

\* Confirm a repeated request with the same transaction id returns the recorded receipt with no second HTTP call

\* Confirm a request tampered after signing fails businessTransactionHash verification and is never executed

\---

\## Architecture

```text

HubSpotDealUpdateService.requestDealUpdate()

&#x20;       │

&#x20;       ▼

outcome cache (by parmana transaction id): replay short-circuits here

&#x20;       │

&#x20;       ▼

hubspot:deal-fetch  →  Execution Gateway  →  HubSpotConnector  →  mock HubSpot server

&#x20;       │

&#x20;       ▼

PolicyEngine.evaluate(hubspot-deal-update policy, signals)

&#x20;       │

&#x20;       ▼

hubspot:deal-update  →  Execution Gateway  →  HubSpotConnector (PATCH dealstage/amount only)

```

\---

\## Running the Tutorial

```bash

npx tsx examples/tutorials/63-hubspot-deal-update/run.ts

```

\---

\## Expected Output

```text

==================================================

Tutorial 63 - HubSpot Deal Update Connector

==================================================



Outcome 1 - Approved and Executed

\--------------------------------------------------

Approved            : true

Applied Deal Stage  : qualifiedtobuy

Applied Amount      : 5500

Policy Reason       : Deal update authorized. The dealstage transition (if any) is on an allowed path, and the amount change (if any) is within threshold or has been pre-authorized.

Token (redacted)    : pat-na1-demo...



Outcome 2 - Denied by Policy

\--------------------------------------------------

Approved      : false

Matched Rule  : reject-stage-transition-not-allowed

Reason        : Deal update rejected because the requested dealstage transition is not on an allowed forward path.



Outcome 3 - Replay Returns Recorded Result

\--------------------------------------------------

Replayed              : true

Same Receipt Returned : true

Deal Stage On HubSpot : qualifiedtobuy (unchanged from qualifiedtobuy)



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

A dealstage/amount update changes what a sales pipeline reports as true, so the bar for this connector is the same as for money movement: a skeptical reader can trust both the code and the receipt. Policy evaluation runs before any update-executing call is made: the proposed stage transition is checked against a forward-only allowlist (plus a fixed allowance to mark a deal lost from any active stage), and any amount change above the configured threshold is denied unless the caller declares it pre-authorized. `privateAppToken` is resolved only inside the existing session credential vault, at execution time, and is destroyed immediately afterward by the existing try/finally pattern — it never reaches this tutorial's own code. Replay of the same transaction id is answered from a local cache before any network call is made at all. Deny-by-default extends to the property level too: a request naming any deal property other than `dealstage`/`amount` is refused before any network call, not silently dropped.

\---

\## Scope

This tutorial covers Deal `dealstage`/`amount` update only. Contacts and Companies objects, deleting or archiving deals, any HubSpot webhook/event-driven trigger, and multi-object transactions are not implemented and are not demonstrated here — see `docs/CLAIMS.md` §3.10 for what is and is not covered by this milestone, including two deliberately unresolved design decisions (per-pipeline vs. global stage-transition rules; one authorization check vs. two).
