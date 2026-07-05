# Execution control

Parmana's authorization proves which content was approved. The execution-control
layer adds the release boundary that makes approved execution flow through a
Parmana-controlled connector. It is additive: Runtime, `ExecutableContent`, the
authorization envelope, cryptography, and `EnvelopeVerifier` remain unchanged.

## Release path

The Runtime produces a decision, executable content, and a content-bound signed
authorization as before. The Execution Gateway verifies the envelope, content
hash, expiry, and replay nonce. Only after those checks pass does it call
`ExecutionControlService`.

The service authenticates the Gateway, resolves a connector, creates a short-lived
session, freezes the request, and invokes the connector. The connector independently
checks its trusted identity, Gateway identity, verification state, capability, and
the session before obtaining a credential and calling its enterprise executor.

## Credential isolation

Credentials are held by `CredentialVault` and requested inside `SecureConnector`
only after policy and session checks succeed. They are passed only to the connector's
`ConnectorExecutor`; they are absent from Runtime, Gateway requests, executable
content, audit events, and execution results. The included vault is an in-memory
demonstration, not a production secret store.

AI, agents, middleware, and Runtime therefore have no credential-bearing API in
this design. A direct connector call cannot invent a valid session and never reaches
credential acquisition.

## Session and tamper binding

Each `GatewaySession` is short-lived and single-use. Its private store record binds
the connector, authorization ID, complete signed authorization, and executable
content using deterministic canonical hashes. The connector atomically validates
and consumes that record. Reuse, expiry, connector substitution, modified content,
or modified authorization is rejected before credential access.

Gateway nonce protection and connector session protection cover different replay
boundaries: the Gateway rejects reuse of an authorization, while the connector
rejects reuse of an execution release.

## Trust and scope

Connectors trust the authenticated Gateway and session authority, not caller claims
from an AI. Connector identities are also allow-listed by the authenticator. The
in-memory authenticator models this boundary with an unforgeable object reference;
production deployments must replace it with workload identity and network controls.

This package enforces the path for enterprise systems whose credentials and APIs are
exclusively placed behind these connectors. It does not claim to prevent execution
through separately issued credentials or an independently reachable enterprise API.
OAuth, cloud IAM, managed identity, HSMs, and network-policy enforcement are outside
this implementation.

Connector capabilities and executors are independent of Runtime, so SAP,
Salesforce, Stripe, Kubernetes, databases, internal APIs, robots, and IoT systems
can be integrated without changing Runtime or authorization formats.
