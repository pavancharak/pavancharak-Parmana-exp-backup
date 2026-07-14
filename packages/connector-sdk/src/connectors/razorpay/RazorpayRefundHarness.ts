import { generateKeyPairSync, type KeyObject } from "node:crypto";

import { CryptoBootstrap, type CryptoProvider } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { CapabilityConnectorPolicy } from "../../CapabilityConnectorPolicy.js";
import { ConnectorSdkRegistry } from "../../ConnectorRegistry.js";
import { connectorCapabilities } from "../../ConnectorTypes.js";
import { StaticCredentialProvider } from "../../CredentialProvider.js";
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
  RAZORPAY_PAYMENT_FETCH_CAPABILITY,
  RAZORPAY_REFUND_CREATE_CAPABILITY,
  RazorpayConnector,
} from "./RazorpayConnector.js";
import { RazorpayCumulativeRefundLedger } from "./RazorpayCumulativeRefundLedger.js";
import { RazorpayMetadata } from "./RazorpayMetadata.js";
import { RazorpayRefundService } from "./RazorpayRefundService.js";

export interface RazorpayRefundHarnessOptions {
  /** Base URL of a local mock (or, in principle, real) Razorpay-shaped HTTP endpoint. */
  readonly baseUrl: string;
  readonly keyId: string;
  readonly keySecret: string;
  readonly policy: Policy;
  readonly ledger?: RazorpayCumulativeRefundLedger;
}

export interface RazorpayRefundHarness {
  readonly service: RazorpayRefundService;
  readonly gateway: ExecutionGateway;
  readonly audit: MemoryExecutionAuditSink;
  readonly connector: RazorpayConnector;

  /**
   * Exposed only so a caller (a test, or tutorial 61) can independently
   * sign and submit its own ExecutionRequest against the same gateway, in
   * order to demonstrate tamper rejection. RazorpayRefundService never
   * exposes this itself and never signs anything except through its own
   * policy-gated requestRefund() flow.
   */
  readonly signerPrivateKey: KeyObject;
  readonly signerKeyId: string;
  readonly crypto: CryptoProvider;
  readonly policy: Policy;
}

/**
 * Wires one RazorpayConnector into the full, unmodified execution-control /
 * execution-gateway pipeline: signed authorizations, envelope verification
 * (signature, expiry, TTL, nonce, businessTransactionHash), one-time
 * Gateway sessions, and session-credential issuance/consumption/
 * destruction. Every piece here is an existing class used exactly as
 * gateway-integration.test.ts and tutorial 59 already use it; nothing is
 * reimplemented.
 *
 * Test-only and tutorial-only wiring convenience: the razorpay-refund
 * business policy pack itself is supplied by the caller, not hidden here.
 */
export function buildRazorpayRefundHarness(options: RazorpayRefundHarnessOptions): RazorpayRefundHarness {
  const crypto = CryptoBootstrap.create();

  //
  // One keypair: the Runtime's signing key. Its private half signs every
  // execution authorization this harness issues; its public half is the
  // "publicKey" the Gateway's EnvelopeVerifier uses to check those same
  // signatures. There is no separate Gateway signing key in this base
  // flow, which is a distinct, additive concept (GatewayAttestationSigner)
  // demonstrated by tutorial 59, not required here.
  //
  const { privateKey: runtimePrivateKey, publicKey: runtimePublicKey } = generateKeyPairSync("ed25519");

  const gatewayIdentity: GatewayIdentity = {
    gatewayId: "gateway-1",
    publicIdentity: "spiffe://parmana/gateway",
    authenticationMetadata: {},
  };
  const connectorIdentity: ConnectorIdentity = {
    connectorId: "razorpay",
    publicIdentity: "spiffe://parmana/connectors/razorpay",
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
    razorpay: { keyId: options.keyId, keySecret: options.keySecret },
  });

  const connector = new RazorpayConnector({
    connectorId: "razorpay",
    capabilities: connectorCapabilities([RAZORPAY_PAYMENT_FETCH_CAPABILITY, RAZORPAY_REFUND_CREATE_CAPABILITY]),
    baseUrl: options.baseUrl,
  });

  const audit = new MemoryExecutionAuditSink();

  const registry = new ConnectorSdkRegistry();
  registry.register({
    connector,
    metadata: RazorpayMetadata,
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
    executionControl: { service, gatewayAuthentication, route: () => "razorpay" },
  });

  const refundService = new RazorpayRefundService({
    gateway,
    signerPrivateKey: runtimePrivateKey,
    signerKeyId: "key-1",
    policyName: options.policy.policyId,
    policyVersion: options.policy.policyVersion,
    policy: options.policy,
    ledger: options.ledger ?? new RazorpayCumulativeRefundLedger(),
    crypto,
  });

  return {
    service: refundService,
    gateway,
    audit,
    connector,
    signerPrivateKey: runtimePrivateKey,
    signerKeyId: "key-1",
    crypto,
    policy: options.policy,
  };
}
