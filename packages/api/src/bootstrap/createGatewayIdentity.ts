import type {
  GatewayIdentity,
} from "@parmana/execution-control";

/**
 * Creates the identity presented by the
 * Execution Gateway to Execution Control.
 *
 * TODO:
 * Replace these placeholder values with
 * your production gateway identity.
 */
export function createGatewayIdentity(): GatewayIdentity {
  return Object.freeze({
    gatewayId: "parmana-gateway",

    publicIdentity: "parmana-gateway",

    authenticationMetadata: Object.freeze({}),
  });
}