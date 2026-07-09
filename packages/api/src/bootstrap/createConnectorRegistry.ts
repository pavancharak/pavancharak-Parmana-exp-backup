import {
  CryptoBootstrap,
} from "@parmana/crypto";

import { createCredentialProvider } from "./createCredentialProvider.js";

import {
  ConnectorSdkRegistry,
  
  CapabilityConnectorPolicy,
} from "@parmana/connector-sdk";

import type {
  ConnectorRegistry,
  ConnectorAuthenticator,
} from "@parmana/execution-control";

import {
  DefaultConnectorPolicy,
  InMemoryGatewaySessionStore,
} from "@parmana/execution-control";

import { createVendorPaymentConnector } from "./createVendorPaymentConnector.js";

/**
 * Creates the production connector registry.
 */
export function createConnectorRegistry(
  authenticator: ConnectorAuthenticator,
  sessions: InMemoryGatewaySessionStore,
): ConnectorRegistry {
  const registry = new ConnectorSdkRegistry();

  const crypto = CryptoBootstrap.create();

  const connector = createVendorPaymentConnector();

  registry.register({
    connector,

    metadata: {
      connectorId: "vendor-payment",
      displayName: "Vendor Payment",
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
      connectorId: "vendor-payment",
      publicIdentity:
        "spiffe://parmana/connectors/vendor-payment",
      authenticationMetadata: {},
    },

  credentialProvider:
  createCredentialProvider(),

    policy:
      new CapabilityConnectorPolicy(
        new DefaultConnectorPolicy(
          authenticator,
          sessions,
        ),
      ),

    gatewayAuthentication: undefined,

    crypto,
  });

  return registry;
}