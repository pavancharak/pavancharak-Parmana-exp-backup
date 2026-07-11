\# Tutorial 56 — Complete Execution Flow™



\## Objective



In this tutorial, you'll execute the complete \*\*Execution Governance\*\* lifecycle in Parmana.



Starting with a business request, you'll authorize the action, generate cryptographic execution evidence, produce an Execution Receipt™, verify that receipt, and arrive at a final trust decision.



This tutorial brings together everything introduced in Tutorials 53–55 into a single end-to-end workflow.



\---



\## What You'll Learn



\* Evaluate a business action

\* Create an Execution Permit™

\* Create an Execution Trust Record™

\* Create an Execution Receipt™

\* Verify the Execution Receipt™

\* Produce a final Execution Trust™ decision



\---



\## Architecture



```text

Business Artifact

&#x20;       │

&#x20;       ▼

Policy Evaluation

&#x20;       │

&#x20;       ▼

Execution Permit™

&#x20;       │

&#x20;       ▼

Execution Trust Record™

&#x20;       │

&#x20;       ▼

Execution Receipt™

&#x20;       │

&#x20;       ▼

Execution Receipt Verifier™

&#x20;       │

&#x20;       ▼

Execution Trust™

```



\---



\## Execution Flow



The tutorial executes the complete Parmana pipeline:



1\. A business artifact is created.

2\. The policy engine authorizes the request.

3\. An Execution Permit™ is issued.

4\. An Execution Trust Record™ is generated.

5\. Both artifacts are combined into an Execution Receipt™.

6\. The receipt is independently verified.

7\. Parmana produces the final trust decision.



Each stage contributes deterministic, cryptographically verifiable evidence that can be audited independently of the original execution runtime.



\---



\## Running the Tutorial



```bash

npx tsx examples/tutorials/56-complete-execution-flow/run.ts

```



\---



\## Expected Output



```text

==================================================

Tutorial 56 - Complete Execution Flow

==================================================



Business Artifact

\--------------------------------------------------

Vendor      : VENDOR-1001

Invoice     : INV-2026-001

Amount      : 25000 USD



Policy Evaluation

\--------------------------------------------------

Decision : ALLOW



Execution Permit

\--------------------------------------------------

Created



Execution Trust Record

\--------------------------------------------------

Created



Execution Receipt

\--------------------------------------------------

Created



Receipt Verification

\--------------------------------------------------

Result : VERIFIED



Execution Trust

\--------------------------------------------------

✓ Enterprise action is authorized.



Tutorial completed successfully.

```



\---



\## Why This Matters



Traditional enterprise systems typically record whether an action succeeded.



Parmana records \*\*why\*\* the action was allowed and produces cryptographic evidence proving that the authorized action, the policy decision, and the execution context remained consistent throughout the execution lifecycle.



By combining authorization, trust evidence, portable receipts, and independent verification, Parmana enables organizations to move from simple execution to \*\*Execution Trust™\*\*.



\---



\## Next Steps



Congratulations! You have completed the foundational Parmana tutorial series.



You have now built and explored:



\* Deterministic execution evidence

\* Classical and post-quantum signatures

\* Hybrid cryptography

\* Execution Permit™

\* Execution Trust Record™

\* Execution Receipt™

\* Execution Receipt Verification™

\* Complete Execution Governance workflow



These concepts form the foundation for more advanced enterprise scenarios, including multi-agent execution, connector governance, execution boundaries, and large-scale enterprise deployments.



