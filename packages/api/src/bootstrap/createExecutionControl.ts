import {
  ExecutionControlService,
  type ExecutionControl,
} from "@parmana/execution-control";
import {
  createSessionStore,
  gatewaySessionIssuanceAuthentication,
} from "./createSessionStore.js";
import { createGatewayIdentity } from "./createGatewayIdentity.js";
import { createConnectorAuthenticator } from "./createConnectorAuthenticator.js";
import { createConnectorRegistry } from "./createConnectorRegistry.js";

import { createExecutionAuditSink } from "./createExecutionAuditSink.js";

/**
 * Constructs the production ExecutionControlService.
 */
export function createExecutionControl(): ExecutionControl {
  const gatewayIdentity =
    createGatewayIdentity();

  const authenticator =
    createConnectorAuthenticator();

  const sessions =
    createSessionStore();

  const registry =
    createConnectorRegistry(
      authenticator,
      sessions,
    );

  const audit =
    createExecutionAuditSink();

  return new ExecutionControlService({
    gatewayIdentity,
    authenticator,
    registry,
    sessions,

    //
    // TODO:
    // Replace with real gateway authentication
    // material (certificate, JWT, mTLS, etc.).
    //
    sessionIssuanceAuthentication:
  gatewaySessionIssuanceAuthentication,

    audit,
  });
}