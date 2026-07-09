import {
  ExecutionControlService,
  InMemoryConnectorRegistry,
  InMemoryGatewaySessionStore,
  MemoryExecutionAuditSink,
  type ConnectorAuthenticator,
  type SecureConnector,
  type ExecutionControl,
} from "@parmana/execution-control";

import { createGatewayIdentity } from "./createGatewayIdentity.js";
import { createConnectorAuthenticator } from "./createConnectorAuthenticator.js";

/**
 * Shared composition root for the Execution Control subsystem.
 *
 * Every production connector MUST share the same:
 *
 * - Gateway identity
 * - Connector authenticator
 * - Session store
 * - Audit sink
 * - Connector registry
 *
 * This eliminates circular dependencies and ensures that
 * every connector validates Gateway-issued sessions using
 * the same state owned by ExecutionControlService.
 */
export class ExecutionControlComposition {
  readonly gatewayIdentity = createGatewayIdentity();

  readonly sessionAuthentication = Object.freeze({});

  readonly authenticator: ConnectorAuthenticator =
    createConnectorAuthenticator();

  readonly sessions =
    new InMemoryGatewaySessionStore(
      this.sessionAuthentication,
    );

  readonly audit =
    new MemoryExecutionAuditSink();

  readonly registry =
    new InMemoryConnectorRegistry();

  register(
    connector: SecureConnector,
  ): void {
    this.registry.register(connector);
  }

  build(): ExecutionControl {
    return new ExecutionControlService({
      gatewayIdentity: this.gatewayIdentity,
      authenticator: this.authenticator,
      registry: this.registry,
      sessions: this.sessions,
      sessionIssuanceAuthentication:
        this.sessionAuthentication,
      audit: this.audit,
    });
  }
}