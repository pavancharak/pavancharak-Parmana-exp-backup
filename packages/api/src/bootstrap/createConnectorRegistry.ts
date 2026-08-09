import {
  CryptoBootstrap,
} from "@parmana/crypto";

import {
  createGatewayConnectorRegistry,
  type GatewayConnectorRegistration,
} from "@parmana/execution-gateway";

import {
  RazorpayMetadata,
  StaticCredentialProvider,
} from "@parmana/connector-sdk";

import type {
  ConnectorRegistry,
  ConnectorAuthenticator,
  ExecutionAuditSink,
} from "@parmana/execution-control";

import {
  DefaultConnectorPolicy,
  InMemoryGatewaySessionStore,
} from "@parmana/execution-control";

import { createRazorpayConnector } from "./createRazorpayConnector.js";
import { createRazorpayCredentialProvider } from "./createRazorpayCredentialProvider.js";
import { HubSpotMetadata } from "@parmana/connector-hubspot";
import { createHubSpotConnector } from "./createHubSpotConnector.js";
import { createHubSpotCredentialProvider } from "./createHubSpotCredentialProvider.js";
import { createTestFixtureConnector } from "./createTestFixtureConnector.js";

/**
 * Creates the production connector registry.
 *
 * gatewayAuthentication is the STATIC, registration-time attestation
 * checked by each connector's own defense-in-depth check (see
 * SessionCredentialSecureConnectorOptions.gatewayAuthentication) — it is
 * NOT request-bound; the request-bound check happens earlier, at
 * SessionCredentialExecutionControl.
 */
export function createConnectorRegistry(
  authenticator: ConnectorAuthenticator,
  sessions: InMemoryGatewaySessionStore,
  audit: ExecutionAuditSink,
  gatewayAuthentication: unknown,
): ConnectorRegistry {
  const registrations: GatewayConnectorRegistration[] = [];

  const crypto = CryptoBootstrap.create();

  const testFixtureConnector = createTestFixtureConnector();

  if (testFixtureConnector !== undefined) {
    registrations.push({
      connector: testFixtureConnector,

      metadata: {
        connectorId: "test-fixture",
        displayName: "Test Fixture",
        version: {
          major: 1,
          minor: 0,
          patch: 0,
        },
        health: {
          status: "healthy",
          checkedAt: new Date().toISOString(),
        },
      },

      connectorIdentity: {
        connectorId: "test-fixture",
        publicIdentity: "spiffe://parmana/connectors/test-fixture",
        authenticationMetadata: {},
      },

      credentialProvider: new StaticCredentialProvider({
        "test-fixture": { token: "test-fixture-token" },
      }),

      policy: new DefaultConnectorPolicy(authenticator, sessions),

      gatewayAuthentication,

      crypto,

      audit,
    });
  }

  const razorpayCredentialProvider = createRazorpayCredentialProvider();

  if (razorpayCredentialProvider === undefined) {
    console.warn({
      event: "razorpay_connector_unavailable",
      reason: "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not configured.",
    });
  } else {
    registrations.push({
      connector: createRazorpayConnector(),

      metadata: RazorpayMetadata,

      connectorIdentity: {
        connectorId: "razorpay",
        publicIdentity: "spiffe://parmana/connectors/razorpay",
        authenticationMetadata: {},
      },

      credentialProvider: razorpayCredentialProvider,

      policy: new DefaultConnectorPolicy(authenticator, sessions),

      gatewayAuthentication,

      crypto,

      audit,
    });
  }

  const hubspotCredentialProvider = createHubSpotCredentialProvider();

  if (hubspotCredentialProvider === undefined) {
    console.warn({
      event: "hubspot_connector_unavailable",
      reason: "HUBSPOT_PRIVATE_APP_TOKEN is not configured.",
    });
  } else {
    registrations.push({
      connector: createHubSpotConnector(),

      metadata: HubSpotMetadata,

      connectorIdentity: {
        connectorId: "hubspot",
        publicIdentity: "spiffe://parmana/connectors/hubspot",
        authenticationMetadata: {},
      },

      credentialProvider: hubspotCredentialProvider,

      policy: new DefaultConnectorPolicy(authenticator, sessions),

      gatewayAuthentication,

      crypto,

      audit,
    });
  }

  return createGatewayConnectorRegistry(registrations);
}