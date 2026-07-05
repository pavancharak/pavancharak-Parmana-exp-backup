\# Parmana



> \*\*Human Authority for Enterprise AI\*\*



Parmana is the \*\*Execution Authorization and Verification Infrastructure for Enterprise AI\*\*.



Modern AI systems can generate plans, make decisions, and execute actions autonomously. Parmana ensures that every high-impact action is authorized, policy-compliant, cryptographically verifiable, and fully auditable before execution.



Parmana does not replace AI systems.



\*\*It authorizes and verifies what they are allowed to execute.\*\*



\---



\# Vision



> \*\*The future isn't AI that simply answers questions. The future is AI that organizations trust to perform real work.\*\*



Parmana enables organizations to safely deploy autonomous AI by providing verifiable execution trust.



\---



\# Core Principle



\*\*AI can propose actions. Only Parmana can authorize execution.\*\*



Every execution must be backed by a cryptographically signed Execution Authorization before work is performed.



\---



\# What Parmana Does



Parmana provides an immutable execution trust layer between AI systems and enterprise execution systems.



For every business transaction Parmana provides:



\* Human Authority

\* Policy Enforcement

\* Decision Evaluation

\* Signed Execution Authorization

\* Envelope Verification

\* Execution Verification

\* Cryptographic Integrity

\* Immutable Evidence

\* Signed Receipts

\* Deterministic Replay



\---



\# Execution Trust Lifecycle



```

Business Transaction

&#x20;       │

&#x20;       ▼

Policy Evaluation

&#x20;       │

&#x20;       ▼

Decision

&#x20;       │

&#x20;       ▼

Signed Execution Authorization

&#x20;       │

&#x20;       ▼

Execution

&#x20;       │

&#x20;       ▼

Execution Trust Record

&#x20;       │

&#x20;       ▼

Verification

&#x20;       │

&#x20;       ▼

Receipt

&#x20;       │

&#x20;       ▼

Replay

```



Every stage becomes part of the permanent Execution Trust Record.



\---



\# Core Components



\## Runtime



Executes authorized Business Transactions.



\---



\## Policy Engine



Evaluates business transactions against organizational policies.



\---



\## Authority Framework



Represents the human authority responsible for execution.



\---



\## Execution Authorization



Produces cryptographically signed Execution Authorization envelopes for approved decisions.



Every authorization includes:



\* Authorization ID

\* Decision ID

\* Business Transaction ID

\* Policy Reference

\* Authorization Timestamp

\* Expiration

\* Nonce

\* Digital Signature



\---



\## Envelope Verification



Verifies Execution Authorization before execution.



Verification includes:



\* Signature verification

\* Expiration validation

\* TTL validation

\* Replay protection

\* Nonce verification



\---



\## Verification Engine



Verifies cryptographic integrity of Execution Trust Records.



\---



\## Receipt Engine



Produces signed immutable Execution Trust Receipts.



\---



\## Replay Engine



Deterministically reconstructs and verifies previous executions.



\---



\## Storage Layer



Persists immutable execution evidence.



\---



\# Execution Trust Record



The Execution Trust Record is Parmana's canonical evidence object.



It contains:



\* Business Transaction

\* Decision

\* Execution Authorization

\* Execution

\* Overrides

\* Verifications

\* Receipts

\* Trust Record Hash

\* Digital Signature



Execution Trust Records are immutable, cryptographically verifiable, and independently auditable.



\---



\# Cryptography



Parmana uses deterministic cryptographic primitives to provide execution integrity.



Current implementation:



\* Canonical Serialization

\* SHA-256 Hashing

\* Ed25519 Digital Signatures

\* Signed Execution Authorization

\* Envelope Verification



Supported signature algorithms:



\* Ed25519

\* Dilithium3 (Post-Quantum)



Future support includes:



\* Hardware Security Modules (HSM)

\* Cloud Key Management Systems

\* Enterprise Key Rotation



\---



\# REST API



Current endpoints:



```

POST /execute



POST /verify



POST /receipt



POST /replay

```



\---



\# Example Workflow



```

POST /execute

&#x20;       │

&#x20;       ▼

Policy Evaluation

&#x20;       │

&#x20;       ▼

Decision

&#x20;       │

&#x20;       ▼

Execution Authorization Generated

&#x20;       │

&#x20;       ▼

Execution Trust Record Created

&#x20;       │

&#x20;       ▼

POST /verify

&#x20;       │

&#x20;       ▼

Verification Stored

&#x20;       │

&#x20;       ▼

POST /receipt

&#x20;       │

&#x20;       ▼

Signed Receipt Generated

&#x20;       │

&#x20;       ▼

POST /replay

&#x20;       │

&#x20;       ▼

Execution Deterministically Verified

```



\---



\# Architecture



```

&#x20;                API

&#x20;                 │

&#x20;                 ▼

&#x20;   Execution Trust Application

&#x20;                 │

&#x20;                 ▼

&#x20;             Runtime

&#x20;                 │

&#x20;                 ▼

&#x20;        Policy Evaluation

&#x20;                 │

&#x20;                 ▼

&#x20;              Decision

&#x20;                 │

&#x20;                 ▼

&#x20;    Execution Authorization

&#x20;                 │

&#x20;                 ▼

&#x20;        Execution System

&#x20;                 │

&#x20;                 ▼

&#x20;     Execution Trust Record

&#x20;                 │

&#x20;                 ▼

&#x20;Repository Layer / Storage Layer

&#x20;                 │

&#x20;                 ▼

&#x20;         Cryptographic Layer

```



Parmana follows a strict separation of concerns where each layer has a single responsibility.



\---



\# Tutorials



```

01 Hello World



02 Policy Evaluation



03 Runtime Execution



04 Policy Router



05 Verification



06 Replay



07 Receipt Generation



08 Human Approval



09 REST API



10 End-to-End



11 Execution Authorization



12 Envelope Verification



13 Post-Quantum Signatures

```



Run all tutorials:



```bash

npm run examples

```



\---



\# Current Capabilities



\* ✅ Business Transaction execution

\* ✅ Policy evaluation

\* ✅ Decision generation

\* ✅ Signed Execution Authorization

\* ✅ Envelope Verification

\* ✅ Execution Trust Record creation

\* ✅ Immutable persistence

\* ✅ Cryptographic hashing

\* ✅ Ed25519 signatures

\* ✅ Dilithium3 support

\* ✅ Verification

\* ✅ Receipt generation

\* ✅ Deterministic replay

\* ✅ REST API

\* ✅ Integration testing



\---



\# Technology Stack



\* TypeScript

\* Node.js

\* Express

\* Vitest

\* Supabase

\* SHA-256

\* Ed25519

\* Dilithium3 (Post-Quantum)



\---



\# Repository Structure



```

packages/



api/

crypto/

envelope-verifier/

execution-system/

policy/

receipt/

replay/

runtime/

shared/

storage/

verification/



examples/

docs/

policies/

scripts/

```



\---



\# Development



Install dependencies



```bash

npm install

```



Build



```bash

npm run build

```



Run all tests



```bash

npm test

```



Run the REST API



```bash

npm run dev

```



Run all examples



```bash

npm run examples

```



Run a specific tutorial



```bash

npx tsx examples/tutorials/11-execution-authorization/run.ts

```



\---



\# Platform Status



| Component               | Status     |

| ----------------------- | ---------- |

| Runtime                 | ✅ Complete |

| Policy Engine           | ✅ Complete |

| Execution Authorization | ✅ Complete |

| Envelope Verification   | ✅ Complete |

| Execution Trust Record  | ✅ Complete |

| Verification            | ✅ Complete |

| Receipt Generation      | ✅ Complete |

| Replay                  | ✅ Complete |

| Cryptography            | ✅ Complete |

| Storage                 | ✅ Complete |

| REST API                | ✅ Complete |

| Integration Tests       | ✅ Complete |

| Tutorials               | ✅ Complete |



\---



\# Roadmap



Next major capabilities include:



\* Policy Management

\* Authority Management

\* Trust Record Query API

\* Enterprise SDKs

\* Monitoring \& Metrics

\* Enterprise Authentication

\* Hardware Security Modules

\* Cloud Key Management

\* Distributed Replay

\* Production Hardening



\---



\# Philosophy



Traditional AI systems ask:



> \*\*Can the AI perform this action?\*\*



Parmana asks:



> \*\*Can this action be trusted?\*\*



Parmana introduces an execution authorization layer between AI decision-making and enterprise execution, ensuring every high-impact action is authorized, verifiable, and replayable before it reaches production systems.



Execution Trust is the missing infrastructure required for Enterprise AI.



\---



\# License



Copyright © Parmana.



All rights reserved.



