import {
  InMemoryConnectorAuthenticator,
  type ConnectorAuthenticator,
} from "@parmana/execution-control";

import { createGatewayIdentity } from "./createGatewayIdentity.js";

/**
 * Creates the ConnectorAuthenticator used by
 * ExecutionControlService.
 *
 * Trusted connector identities are configured here.
 * This file must not depend on the ConnectorRegistry,
 * otherwise a circular dependency is created.
 */
export function createConnectorAuthenticator(): ConnectorAuthenticator {
  const gatewayIdentity =
    createGatewayIdentity();

  return new InMemoryConnectorAuthenticator(
    gatewayIdentity,
    undefined,
    [
      {
        connectorId: "vendor-payment",
        publicIdentity:
          "spiffe://parmana/connectors/vendor-payment",
        authenticationMetadata: {},
      },
    ],
  );
}