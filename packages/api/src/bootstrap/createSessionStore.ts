import { InMemoryGatewaySessionStore } from "@parmana/execution-control";

/**
 * Temporary shared authentication used by both
 * ExecutionControlService and the Gateway session
 * store during bootstrap.
 *
 * TODO:
 * Replace with the production authentication
 * mechanism.
 */
const gatewaySessionIssuanceAuthentication = Object.freeze({});

export function createSessionStore(): InMemoryGatewaySessionStore {
  return new InMemoryGatewaySessionStore(
    gatewaySessionIssuanceAuthentication,
  );
}

export {
  gatewaySessionIssuanceAuthentication,
};