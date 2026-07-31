import { generateKeyPairSync, type KeyObject } from "node:crypto";

import { CryptoBootstrap, type CryptoProvider } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  CapabilityConnectorPolicy,
  ConnectorSdkRegistry,
  StaticCredentialProvider,
  connectorCapabilities,
} from "@parmana/connector-sdk";
import {
  DefaultConnectorPolicy,
  ExecutionControlService,
  InMemoryConnectorAuthenticator,
  InMemoryGatewaySessionStore,
  MemoryExecutionAuditSink,
  type ConnectorIdentity,
  type GatewayIdentity,
} from "@parmana/execution-control";
import { ExecutionGateway } from "@parmana/execution-gateway";
import type { Policy } from "@parmana/policy";

import {
  HUBSPOT_DEAL_FETCH_CAPABILITY,
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
  HubSpotConnector,
} from "./HubSpotConnector.js";
import { HubSpotMetadata } from "./HubSpotMetadata.js";
import { HubSpotDealUpdateService } from "./HubSpotDealUpdateService.js";

export interface HubSpotDealUpdateHarnessOptions {
  /** Base URL of a local mock (or, in principle, real) HubSpot-shaped HTTP endpoint. */
  readonly baseUrl: string;
  readonly privateAppToken: string;
  readonly policy: Policy;
  readonly amountChangeThreshold?: number;
  readonly stageOrder?: readonly string[];
}

export interface HubSpotDealUpdateHarness {
  readonly service: HubSpotDealUpdateService;
  readonly gateway: ExecutionGateway;
  readonly audit: MemoryExecutionAuditSink;
  readonly connector: HubSpotConnector;

  /**
   * Exposed only so a caller (a test) can independently sign and submit
   * its own ExecutionRequest against the same gateway, in order to
   * demonstrate tamper rejection. HubSpotDealUpdateService never
   * exposes this itself and never signs anything except through its own
   * policy-gated requestDealUpdate() flow.
   */
  readonly signerPrivateKey: KeyObject;
  readonly signerKeyId: string;
  readonly crypto: CryptoProvider;
  readonly policy: Policy;
}

/**
 * Wires one HubSpotConnector into the full, unmodified execution-control
 * / execution-gateway pipeline: signed authorizations, envelope
 * verification (signature, expiry, TTL, nonce, businessTransactionHash),
 * one-time Gateway sessions, and session-credential
 * issuance/consumption/destruction. Every piece here is an existing
 * class used exactly as RazorpayRefundHarness already uses it; nothing
 * is reimplemented.
 *
 * Test-only wiring convenience: the hubspot-deal-update business policy
 * pack itself is supplied by the caller, not hidden here.
 */
export function buildHubSpotDealUpdateHarness(options: HubSpotDealUpdateHarnessOptions): HubSpotDealUpdateHarness {
  const crypto = CryptoBootstrap.create();

  //
  // One keypair: the Runtime's signing key. Its private half signs every
  // execution authorization this harness issues; its public half is the
  // "publicKey" the Gateway's EnvelopeVerifier uses to check those same
  // signatures.
  //
  const { privateKey: runtimePrivateKey, publicKey: runtimePublicKey } = generateKeyPairSync("ed25519");

  const gatewayIdentity: GatewayIdentity = {
    gatewayId: "gateway-1",
    publicIdentity: "spiffe://parmana/gateway",
    authenticationMetadata: {},
  };
  const connectorIdentity: ConnectorIdentity = {
    connectorId: "hubspot",
    publicIdentity: "spiffe://parmana/connectors/hubspot",
    authenticationMetadata: {},
  };

  const gatewayAuthentication = Object.freeze({ token: "gateway-authentication-token" });
  const sessionIssuanceAuthentication = Object.freeze({ capability: "session-issuer" });

  const sessions = new InMemoryGatewaySessionStore(sessionIssuanceAuthentication);
  const authenticator = new InMemoryConnectorAuthenticator(gatewayIdentity, gatewayAuthentication, [
    connectorIdentity,
  ]);
  const connectorPolicy = new CapabilityConnectorPolicy(new DefaultConnectorPolicy(authenticator, sessions));

  const credentialProvider = new StaticCredentialProvider({
    hubspot: { privateAppToken: options.privateAppToken },
  });

  const connector = new HubSpotConnector({
    connectorId: "hubspot",
    capabilities: connectorCapabilities([HUBSPOT_DEAL_FETCH_CAPABILITY, HUBSPOT_DEAL_UPDATE_CAPABILITY]),
    baseUrl: options.baseUrl,
  });

  const audit = new MemoryExecutionAuditSink();

  const registry = new ConnectorSdkRegistry();
  registry.register({
    connector,
    metadata: HubSpotMetadata,
    connectorIdentity,
    credentialProvider,
    policy: connectorPolicy,
    gatewayAuthentication,
    crypto,
    audit,
  });

  const service = new ExecutionControlService({
    gatewayIdentity,
    authenticator,
    registry,
    sessions,
    audit,
    sessionIssuanceAuthentication,
  });

  const gateway = new ExecutionGateway({
    publicKey: runtimePublicKey,
    nonceStore: new MemoryNonceStore(),
    executionControl: { service, gatewayAuthentication, route: () => "hubspot" },
  });

  const dealUpdateService = new HubSpotDealUpdateService({
    gateway,
    signerPrivateKey: runtimePrivateKey,
    signerKeyId: "key-1",
    policyName: options.policy.policyId,
    policyVersion: options.policy.policyVersion,
    policy: options.policy,
    crypto,
    ...(options.amountChangeThreshold !== undefined ? { amountChangeThreshold: options.amountChangeThreshold } : {}),
    ...(options.stageOrder !== undefined ? { stageOrder: options.stageOrder } : {}),
  });

  return {
    service: dealUpdateService,
    gateway,
    audit,
    connector,
    signerPrivateKey: runtimePrivateKey,
    signerKeyId: "key-1",
    crypto,
    policy: options.policy,
  };
}
