\# Tutorial 53 — Execution Permit™



\## Objective



In this tutorial, you'll create an \*\*Execution Permit™\*\*, the cryptographically signed authorization that allows an enterprise action to proceed.



Unlike the previous tutorials, which focused on cryptographic primitives, this tutorial introduces the first core artifact of Parmana's \*\*execution trust\*\* model.



An Execution Permit binds a business action, the governing policy, and the authorization decision into an immutable, signed object.



\---



\## What You'll Learn



\* Build an Execution Permit

\* Generate a deterministic artifact hash

\* Create a hybrid signature (Ed25519 + ML-DSA-65)

\* Bind policy metadata to an authorization

\* Produce a portable authorization artifact



\---



\## Architecture



```text

Business Artifact

&#x20;       │

&#x20;       ▼

Deterministic Hash

&#x20;       │

&#x20;       ▼

Execution Decision

&#x20;       │

&#x20;       ▼

Hybrid Signature

&#x20;       │

&#x20;       ▼

Execution Permit™

```



\---



\## Execution Permit



An Execution Permit records:



\* Permit identifier

\* Authorization decision

\* Artifact hash

\* Gateway identity

\* Policy version

\* Issue time

\* Expiration time

\* Hybrid cryptographic signatures



The permit becomes the cryptographic proof that Parmana authorized a specific action under a specific policy.



\---



\## Running the Tutorial



```bash

npx tsx examples/tutorials/53-execution-permit/run.ts

```



\---



\## Expected Output



```text

==================================================

Tutorial 53 - Execution Permit

==================================================



Execution Permit

\--------------------------------------------------



Permit ID      : PERMIT-000001



Decision       : ALLOW



Gateway        : parmana-gateway



Policy Version : v1



Issued At      : 2026-07-11T09:30:00.000Z



Expires At     : 2026-07-11T09:32:00.000Z



Signatures

\--------------------------------------------------



Algorithm : ed25519

Key ID    : default



Algorithm : dilithium3

Key ID    : pq



✓ Execution Permit created successfully.



Tutorial completed successfully.

```



\---



\## Why This Matters



Cryptographic signatures alone prove that data has not been modified.



An Execution Permit goes further by proving:



\* what action was authorized,

\* who authorized it,

\* which policy was evaluated,

\* when the authorization was issued,

\* when it expires, and

\* which cryptographic identities approved the execution.



This transforms cryptographic signatures into enterprise authorization evidence.



\---



\## Next Tutorial



Continue with \*\*Tutorial 54 – Execution Receipt™\*\*, where the Execution Permit is combined with execution evidence to produce a complete, portable proof of enterprise execution.



