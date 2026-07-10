# Parmana

> **Proof of Human Authority in AI Systems**

**Parmana** is an **Execution Governance** platform that ensures AI only performs the actions a company allows.

As organizations deploy autonomous AI agents, the challenge is no longer generating intelligent responses—it's controlling what those agents are permitted to execute.

Parmana sits between AI and enterprise systems, evaluating every requested action against organizational policy, verifying authorization, producing immutable evidence, and ensuring every execution can be independently verified.

---

# Why Parmana?

Large language models can reason, plan, and invoke tools, but they cannot determine what an organization should allow them to do.

Without execution governance, AI can:

* Execute actions outside approved policy
* Use credentials beyond its intended scope
* Perform unintended operations after authorization
* Produce decisions that cannot be independently verified
* Leave organizations without defensible audit evidence

Enterprises need more than intelligent AI.

They need trustworthy execution.

---

# Execution Governance

Execution Governance is the layer between AI reasoning and business execution.

Instead of trusting an AI agent to decide what it may execute, Parmana ensures every execution is:

* Authorized
* Policy evaluated
* Independently verifiable
* Cryptographically protected
* Fully auditable
* Replayable

Parmana does not replace AI.

It governs execution.

---

# How Parmana Works

```
Human Authority
        │
        ▼
Authorization
        │
        ▼
Intent
        │
        ▼
Business Transaction
        │
        ▼
Policy Evaluation
        │
        ▼
Decision
        │
        ▼
Execution
        │
        ▼
Verification
        │
        ▼
Receipt
        │
        ▼
Execution Trust Record™
```

Every business action produces immutable evidence that can be independently verified.

---

# Core Concepts

## Authority

The entity empowered to authorize execution.

Examples:

* User
* Role
* Service
* Organization

---

## Authorization

Proof that an Authority approved an intended action.

Authorization answers:

> Who allowed this execution?

---

## Intent

The immutable declaration of the requested business action.

Intent answers:

> What exactly was requested?

---

## Business Transaction

The canonical input accepted by Parmana.

It combines:

* metadata
* authority
* authorization
* intent
* policy reference
* runtime signals

The Business Transaction is immutable.

---

## Policy

Deterministic business rules evaluated against runtime signals.

Policies:

* are deterministic
* have no side effects
* never call external systems
* never invoke AI
* never mutate execution

---

## Decision

The result of policy evaluation.

Every Decision contains:

* outcome
* reason
* evaluated policy
* evaluated signals
* timestamp

---

## Execution

The immutable record of what was executed.

Execution represents the actual business operation performed after authorization.

---

## Verification

Independent validation that the Execution Trust Record has not been modified.

Verification ensures:

* integrity
* authenticity
* consistency

---

## Receipt

A cryptographically signed receipt proving execution.

Receipts can be verified independently without trusting Parmana itself.

---

## Execution Trust Record™

The canonical evidence object produced by Parmana.

An Execution Trust Record contains:

* Business Transaction
* Executions
* Overrides
* Verifications
* Receipts
* Trust Record Hash
* Digital Signature

This is the permanent source of truth for every execution.

---

# Core Guarantees

Parmana guarantees:

* AI executes only authorized actions
* Policy evaluation is deterministic
* Execution evidence is immutable
* Every execution is independently verifiable
* Every receipt is cryptographically signed
* Complete execution history is replayable
* Every execution has a single canonical trust record

---

# Repository Structure

```
packages/

├── api/
├── connector-sdk/
├── crypto/
├── envelope-verifier/
├── execution-control/
├── execution-gateway/
├── execution-system/
├── policy/
├── receipt/
├── replay/
├── runtime/
├── shared/
└── storage/

docs/
examples/
openapi/
typescript/
python/
```

---

# Quick Start

Install dependencies:

```bash
npm install
```

Build the workspace:

```bash
npm run rebuild
```

Run the test suite:

```bash
npm test
```

Run linting:

```bash
npm run lint
```

Type check:

```bash
npm run typecheck
```

---

# Example

```typescript
const result = await runtime.execute(transaction);

console.log(result.decision.outcome);

console.log(result.trustRecord);

console.log(result.receipt);
```

Every execution returns immutable evidence that can be verified independently.

---

# Design Principles

Parmana follows a small set of non-negotiable engineering principles.

## Human Authority

AI never creates authority.

Authority always originates from an authorized human or enterprise system.

---

## Determinism

The same inputs always produce the same decision.

Policies are deterministic by design.

---

## Immutable Evidence

Execution evidence is append-only.

Historical evidence is never modified.

---

## Independent Verification

Evidence can be verified without trusting the executing system.

---

## Cryptographic Integrity

Execution Trust Records and Receipts are protected using modern cryptographic primitives.

---

## Replayability

Historical executions can be replayed to prove identical policy outcomes.

---

# Documentation

Documentation is organized into:

* Architecture
* Concepts
* API
* Storage
* Verification
* Trust Records
* Tutorials
* Examples

See the `docs/` directory for detailed specifications.

---

# Roadmap

Current foundation:

* ✅ Execution Governance
* ✅ Policy Engine
* ✅ Runtime
* ✅ Verification
* ✅ Replay
* ✅ Receipt Generation
* ✅ Execution Trust Records
* ✅ REST API
* ✅ TypeScript SDK
* ✅ Python SDK

Next milestones:

* Execution Gateway
* Credential Isolation
* Enterprise Connectors
* Connector Enforcement
* SAP Integration
* Salesforce Integration
* Stripe Integration
* GitHub Integration
* ServiceNow Integration

---

# Contributing

Contributions are welcome.

Please:

* discuss significant architectural changes before implementation
* maintain deterministic behavior
* preserve immutable evidence
* include tests for all changes
* update documentation alongside code

---

# License

Licensed under the Apache License 2.0.

---

# Parmana

**Execution Governance for AI.**

**Execution Trust Infrastructure.**

**Proof of Human Authority in AI Systems.**

# Getting Started

## Prerequisites

Parmana requires:

* Node.js 22 or later
* npm 10 or later
* Git

Optional:

* Docker
* Supabase
* PostgreSQL

---

## Clone

```bash
git clone https://github.com/pavancharak/parmana.git

cd parmana
```

---

## Install

```bash
npm install
```

---

## Build

```bash
npm run rebuild
```

---

## Test

```bash
npm test
```

---

## Type Check

```bash
npm run typecheck
```

---

## Lint

```bash
npm run lint
```

---

# Repository Architecture

```text
packages/

api/
REST API

runtime/
Execution orchestration

policy/
Deterministic policy evaluation

execution-control/
Execution authorization control

execution-gateway/
Secure execution gateway

envelope-verifier/
Execution Permit verification

crypto/
Cryptographic services

receipt/
Receipt generation

replay/
Deterministic replay

storage/
Execution Trust Record persistence

shared/
Common domain model

connector-sdk/
SDK for enterprise connectors
```

Every package has a single responsibility.

Dependencies flow inward toward the shared domain model.

---

# Execution Pipeline

```text
Business Transaction
          │
          ▼
Runtime
          │
          ▼
Policy Engine
          │
          ▼
Decision
          │
          ▼
Execution Control
          │
          ▼
Execution Gateway
          │
          ▼
Enterprise System
          │
          ▼
Verification
          │
          ▼
Receipt
          │
          ▼
Execution Trust Record
```

Each stage produces evidence that becomes part of the immutable trust record.

---

# Execution Trust Record™

Every execution produces one canonical Execution Trust Record.

It contains:

* Business Transaction
* Decision
* Execution history
* Overrides
* Verification history
* Receipt history
* Canonical hash
* Digital signature

The Trust Record is append-only.

Historical evidence is never modified.

---

# Verification

Verification proves that the recorded execution is authentic and has not been altered.

Verification includes:

* structural validation
* hash validation
* signature validation
* replay validation

Verification can be performed independently of the Runtime.

---

# Replay

Replay executes the original policy evaluation using the recorded inputs.

Replay guarantees:

* deterministic execution
* identical policy evaluation
* identical authorization outcome

Replay does not re-execute business actions.

It validates the recorded decision.

---

# Receipts

Receipts are portable cryptographic evidence.

A Receipt proves:

* the execution occurred
* the execution was authorized
* the Trust Record existed
* the Trust Record passed verification

Receipts can be verified without access to internal runtime state.

---

# Security Principles

Parmana is designed around zero implicit trust.

Core principles:

* Human authority is required.
* AI never creates authority.
* Policy evaluation is deterministic.
* Evidence is immutable.
* Verification is independent.
* Execution is auditable.
* Historical decisions are replayable.

---

# Supported Deployment

Parmana is designed for enterprise deployment.

Typical architecture:

```text
AI Agent
      │
      ▼
Parmana Runtime
      │
      ├── Policy Engine
      ├── Execution Control
      ├── Execution Gateway
      ├── Verification
      └── Receipt Generation
               │
               ▼
Enterprise Systems
```

The Runtime governs execution while enterprise systems remain the systems of record.

---

# Current Capabilities

Implemented today:

* Execution Governance
* Execution Trust Infrastructure
* Business Transaction model
* Deterministic Policy Engine
* Runtime
* Execution Control
* Execution Gateway
* Envelope Verification
* Replay
* Receipt Generation
* Execution Trust Records
* REST API
* TypeScript SDK
* Python SDK
* Storage abstraction
* Cryptographic verification

---

# Roadmap

The next phase focuses on enterprise integrations rather than new governance primitives.

Planned capabilities:

* Credential Isolation
* Connector Enforcement
* Enterprise Identity Integration
* SAP Connector
* Salesforce Connector
* Stripe Connector
* GitHub Connector
* ServiceNow Connector
* Enterprise observability
* Operations dashboard

---

# Contributing

We welcome contributions that strengthen the Execution Governance platform.

Before contributing:

* discuss architectural changes
* preserve deterministic behavior
* maintain immutable evidence
* include automated tests
* update documentation

Architectural consistency is preferred over feature velocity.

---

# License

Licensed under the Apache License 2.0.

---

# Vision

AI should not simply be intelligent.

AI should be accountable.

Parmana provides the governance layer that ensures every AI execution is authorized, verifiable, and backed by immutable evidence.

As AI becomes capable of executing increasingly powerful actions across enterprise systems, organizations need more than access control—they need proof that every execution occurred within approved authority.

Parmana exists to provide that proof.

**Parmana**

**Execution Governance for AI**

**Execution Trust Infrastructure**

**Proof of Human Authority in AI Systems**


Credential Isolation — AI never receives enterprise credentials directly.
Connector Enforcement — Enterprise systems accept requests only through Parmana-managed connectors.
Enterprise Connectors — SAP, Salesforce, Stripe, GitHub, ServiceNow, etc., become protected entry points.