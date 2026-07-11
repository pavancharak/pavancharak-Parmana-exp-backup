\# Tutorial 54 — Execution Receipt™



\## Objective



In this tutorial, you'll create an \*\*Execution Receipt™\*\*, Parmana's portable cryptographic proof that an enterprise action was authorized and is ready for independent verification.



An Execution Receipt combines an \*\*Execution Permit™\*\* with an \*\*Execution Trust Record™\*\* into a single immutable artifact.



This is the first tutorial that demonstrates Parmana's \*\*Execution Trust™\*\* model.



\---



\## What You'll Learn



\* Create an Execution Permit™

\* Create an Execution Trust Record™

\* Combine both into an Execution Receipt™

\* Produce a portable execution evidence package



\---



\## Architecture



```text

Business Artifact

&#x20;       │

&#x20;       ▼

Execution Permit™

&#x20;       │

&#x20;       ▼

Execution Trust Record™

&#x20;       │

&#x20;       ▼

Execution Receipt™

```



\---



\## Execution Receipt™



An Execution Receipt contains:



\* Receipt version

\* Execution Permit™

\* Execution Trust Record™



Together, these provide portable, immutable proof of:



\* what was authorized,

\* which policy was evaluated,

\* who authorized the execution,

\* when the authorization occurred,

\* the cryptographic evidence supporting the authorization.



Unlike a standalone signature, an Execution Receipt captures the complete authorization context required for later verification.



\---



\## Running the Tutorial



```bash

npx tsx examples/tutorials/54-execution-receipt/run.ts

```



\---



\## Expected Output



```text

==================================================

Tutorial 54 - Execution Receipt

==================================================



Execution Receipt

\--------------------------------------------------



Version        : 1



Permit ID      : PERMIT-000001



Decision       : ALLOW



Gateway        : parmana-gateway



Policy Version : v1



Artifact Hash  :

1b0cf8d0...



Timestamp      :

2026-07-11T09:30:00.000Z



Receipt Signatures

\--------------------------------------------------



Algorithm : ed25519

Key ID    : default



Algorithm : dilithium3

Key ID    : pq



✓ Execution Receipt created successfully.



Tutorial completed successfully.

```



\---



\## Why This Matters



An Execution Permit proves that Parmana authorized an action.



An Execution Trust Record proves the authorization was cryptographically bound to the exact business artifact.



An Execution Receipt packages both into a portable evidence artifact that can be archived, exchanged, audited, or independently verified without requiring access to Parmana's runtime.



This portability is fundamental to Parmana's Execution Trust™ architecture.



\---



\## Next Tutorial



Continue with \*\*Tutorial 55 – Execution Receipt Verification™\*\*, where you'll independently verify the integrity and authenticity of an Execution Receipt using its embedded cryptographic evidence.



