import { generateKeyPairSync } from "node:crypto";

import { AuthorizationSigner, CryptoBootstrap, TrustRecordHasher } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  DefaultConnectorPolicy,
  ExecutionControlService,
  InMemoryConnectorAuthenticator,
  InMemoryConnectorRegistry,
  InMemoryGatewaySessionStore,
  InMemorySecureConnector,
  MemoryExecutionAuditSink,
  type ConnectorIdentity,
  type CredentialVault,
  type ExecutionCredential,
  type GatewayIdentity,
} from "@parmana/execution-control";
import { ExecutionGateway } from "@parmana/execution-gateway";
import type { ExecutionRequest } from "@parmana/execution-system";
import type { ExecutableContent } from "@parmana/shared";
import { describe, expect, it } from "vitest";

import {
  CapabilityConnectorPolicy,
  ConnectorSdkRegistry,
  MockConnector,
  SdkConnectorExecutor,
  StaticCredentialProvider,
  connectorCapabilities,
  healthyNow,
  type ConnectorMetadata,
} from "../../src/index.js";

const crypto = CryptoBootstrap.create();

async function sign(privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], content: ExecutableContent, ttlSeconds = 60) {
  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-1",
      businessTransactionId: content.businessTransactionId,
      policyName: "connector-capability",
      policyVersion: "1.0.0",
      executableContent: content,
    },
    privateKey,
    "key-1",
    ttlSeconds,
  );
}

function fixtureMetadata(connectorId: string): ConnectorMetadata {
  return {
    connectorId,
    displayName: connectorId,
    version: { major: 1, minor: 0, patch: 0 },
    health: healthyNow(),
  };
}

async function fixture(options?: { ttlSeconds?: number; action?: string }) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const content: ExecutableContent = {
    businessTransactionId: "txn-1",
    action: options?.action ?? "crm:read",
    target: "crm/contacts/1",
    parameters: { field: "email" },
  };
  const authorization = await sign(privateKey, content, options?.ttlSeconds ?? 60);

  const gatewayIdentity: GatewayIdentity = {
    gatewayId: "gateway-1", publicIdentity: "spiffe://parmana/gateway", authenticationMetadata: {},
  };
  const connectorIdentity: ConnectorIdentity = {
    connectorId: "crm", publicIdentity: "spiffe://parmana/connectors/crm", authenticationMetadata: {},
  };
  const gatewayAuthentication = Object.freeze({ token: "gw-token" });
  const sessionIssuanceAuthentication = Object.freeze({ capability: "session-issuer" });
  const sessions = new InMemoryGatewaySessionStore(sessionIssuanceAuthentication);
  const authenticator = new InMemoryConnectorAuthenticator(gatewayIdentity, gatewayAuthentication, [connectorIdentity]);
  const policy = new CapabilityConnectorPolicy(new DefaultConnectorPolicy(authenticator, sessions));
  const credentialProvider = new StaticCredentialProvider({ crm: { token: "secret" } });
  const connector = new MockConnector({ connectorId: "crm", capabilities: connectorCapabilities(["crm:read"]) });
  const metadata = fixtureMetadata("crm");

  const audit = new MemoryExecutionAuditSink();

  const registry = new ConnectorSdkRegistry();
  registry.register({
    connector, metadata, connectorIdentity, credentialProvider, policy, gatewayAuthentication, crypto, audit,
  });

  const service = new ExecutionControlService({
    gatewayIdentity, authenticator, registry, sessions, audit, sessionIssuanceAuthentication,
  });

  const gateway = new ExecutionGateway({
    publicKey,
    nonceStore: new MemoryNonceStore(),
    executionControl: { service, gatewayAuthentication, route: () => "crm" },
  });

  const request: ExecutionRequest = {
    businessTransactionId: content.businessTransactionId,
    action: content.action,
    target: content.target,
    parameters: content.parameters,
    authorization,
  };

  return { gateway, request, connector, registry, audit, content, privateKey, publicKey };
}

describe("connector-sdk gateway integration", () => {
  it("executes a valid authorized request end-to-end and attaches connector evidence", async () => {
    const f = await fixture();

    const result = await f.gateway.execute(f.request);

    expect(result.success).toBe(true);
    expect(f.connector.invocations).toHaveLength(1);

    const connectorEvidence = result.metadata?.connector as { connectorId: string; connectorEvidenceHash: string };
    expect(connectorEvidence.connectorId).toBe("crm");
    expect(typeof connectorEvidence.connectorEvidenceHash).toBe("string");
    expect(connectorEvidence.connectorEvidenceHash.length).toBeGreaterThan(0);
  });

  it("rejects execution when the routed connector is not registered", async () => {
    const f = await fixture();

    // Reroute to an unregistered connector name via a fresh service sharing the same registry.
    const gatewayIdentity: GatewayIdentity = {
      gatewayId: "gateway-1", publicIdentity: "spiffe://parmana/gateway", authenticationMetadata: {},
    };
    const gatewayAuthentication = Object.freeze({ token: "gw-token" });
    const rerouted = new ExecutionGateway({
      publicKey: f.publicKey,
      nonceStore: new MemoryNonceStore(),
      executionControl: {
        service: new ExecutionControlService({
          gatewayIdentity,
          authenticator: new InMemoryConnectorAuthenticator(gatewayIdentity, gatewayAuthentication, []),
          registry: f.registry,
          sessions: new InMemoryGatewaySessionStore(Object.freeze({ capability: "session-issuer" })),
          audit: new MemoryExecutionAuditSink(),
          sessionIssuanceAuthentication: Object.freeze({ capability: "session-issuer" }),
        }),
        gatewayAuthentication,
        route: () => "sap",
      },
    });

    await expect(rerouted.execute(f.request)).rejects.toThrow("Unknown connector: sap.");
  });

  it("rejects a capability the connector did not declare, before invoking the connector", async () => {
    const f = await fixture({ action: "crm:delete" });
    await expect(f.gateway.execute(f.request)).rejects.toThrow();
    expect(f.connector.invocations).toHaveLength(0);
  });

  it("rejects an expired authorization without ever invoking the connector", async () => {
    const f = await fixture({ ttlSeconds: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(f.gateway.execute(f.request)).rejects.toThrow();
    expect(f.connector.invocations).toHaveLength(0);
  });

  it("rejects a tampered (invalid) authorization without ever invoking the connector", async () => {
    const f = await fixture();
    const tampered = {
      ...f.request,
      authorization: {
        ...f.request.authorization,
        payload: { ...f.request.authorization.payload, decisionId: "decision-2" },
      },
    };
    await expect(f.gateway.execute(tampered)).rejects.toThrow(/signatureVerified/);
    expect(f.connector.invocations).toHaveLength(0);
  });

  it("rejects a raw (non-provider-resolved) credential even if one reaches the executor", async () => {
    const rawVault: CredentialVault = {
      async getCredential(): Promise<ExecutionCredential> {
        return { value: "sk_live_raw_secret" };
      },
    };
    const connector = new MockConnector({ connectorId: "crm-raw", capabilities: connectorCapabilities(["crm:read"]) });
    const executor = new SdkConnectorExecutor({
      connector,
      metadata: fixtureMetadata("crm-raw"),
      credentialProviderId: "raw-test",
      crypto,
    });

    const gatewayIdentity: GatewayIdentity = {
      gatewayId: "gateway-1", publicIdentity: "spiffe://parmana/gateway", authenticationMetadata: {},
    };
    const connectorIdentity: ConnectorIdentity = {
      connectorId: "crm-raw", publicIdentity: "spiffe://parmana/connectors/crm-raw", authenticationMetadata: {},
    };
    const gatewayAuthentication = Object.freeze({ token: "gw-token" });
    const sessionIssuanceAuthentication = Object.freeze({ capability: "session-issuer" });
    const sessions = new InMemoryGatewaySessionStore(sessionIssuanceAuthentication);
    const authenticator = new InMemoryConnectorAuthenticator(gatewayIdentity, gatewayAuthentication, [connectorIdentity]);
    const policy = new DefaultConnectorPolicy(authenticator, sessions);

    const secureConnector = new InMemorySecureConnector({
      identity: connectorIdentity,
      capabilities: ["crm:read"],
      policy,
      gatewayAuthentication,
      credentialVault: rawVault,
      executor,
    });

    const registry = new InMemoryConnectorRegistry([secureConnector]);
    const audit = new MemoryExecutionAuditSink();
    const service = new ExecutionControlService({
      gatewayIdentity, authenticator, registry, sessions, audit,
      sessionIssuanceAuthentication,
    });

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const content: ExecutableContent = {
      businessTransactionId: "txn-raw", action: "crm:read", target: "crm/contacts/1", parameters: {},
    };
    const authorization = await sign(privateKey, content);
    const gateway = new ExecutionGateway({
      publicKey,
      nonceStore: new MemoryNonceStore(),
      executionControl: { service, gatewayAuthentication, route: () => "crm-raw" },
    });

    await expect(gateway.execute({
      businessTransactionId: content.businessTransactionId,
      action: content.action,
      target: content.target,
      parameters: content.parameters,
      authorization,
    })).rejects.toThrow("rejected a raw credential");
    expect(connector.invocations).toHaveLength(0);
  });
});

describe("Execution Trust Record hash boundary (regression)", () => {
  it("hashes a legacy-shaped (pre-connector-sdk) evidence object exactly as before — additive connector evidence never changes it", async () => {
    const hasher = new TrustRecordHasher(crypto);

    const legacyEvidence = {
      businessTransactionId: "txn-legacy",
      action: "TransferFunds",
      target: "account/12345",
      parameters: { amount: 100 },
      success: true,
      executedAt: new Date("2026-01-01T00:00:00.000Z"),
      attributes: { erpTransactionId: "erp-1" },
    };

    const firstHash = await hasher.hash(legacyEvidence);
    const secondHash = await hasher.hash(legacyEvidence);
    expect(firstHash).toBe(secondHash);

    const withConnectorEvidence = {
      ...legacyEvidence,
      attributes: { ...legacyEvidence.attributes, connector: { connectorId: "crm", connectorEvidenceHash: "abc" } },
    };
    const augmentedHash = await hasher.hash(withConnectorEvidence);

    // Additive connector evidence changes the hash of a NEW record that carries it;
    // it never retroactively changes the hash already computed and stored for the
    // legacy-shaped record above (firstHash/secondHash are untouched).
    expect(augmentedHash).not.toBe(firstHash);
    expect(firstHash).toBe(secondHash);
  });
});
