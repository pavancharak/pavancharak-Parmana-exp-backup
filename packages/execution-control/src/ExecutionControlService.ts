import type { ExecutionResult } from "@parmana/shared";

import { deepFreeze } from "./deepFreeze.js";
import { InMemoryGatewaySessionStore } from "./GatewaySessionStore.js";
import type {
  ConnectorAuthenticator,
  ConnectorRegistry,
  ExecutionAuditSink,
  ExecutionControl,
  ExecutionRelease,
  GatewayExecutionRequest,
  GatewayIdentity,
} from "./types.js";

export interface ExecutionControlServiceOptions {
  readonly gatewayIdentity: GatewayIdentity;
  readonly authenticator: ConnectorAuthenticator;
  readonly registry: ConnectorRegistry;
  readonly sessions: InMemoryGatewaySessionStore;
  readonly sessionIssuanceAuthentication: unknown;
  readonly audit: ExecutionAuditSink;
  readonly sessionLifetimeMs?: number;
}

export class ExecutionControlService implements ExecutionControl {
  private readonly sessionLifetimeMs: number;

  constructor(private readonly options: ExecutionControlServiceOptions) {
    this.sessionLifetimeMs = options.sessionLifetimeMs ?? 30_000;
    if (this.sessionLifetimeMs <= 0) throw new Error("Session lifetime must be positive.");
  }

  async execute(
    release: ExecutionRelease,
    gatewayAuthentication: unknown,
  ): Promise<ExecutionResult> {
    if (!this.options.authenticator.authenticateGateway(
      this.options.gatewayIdentity,
      gatewayAuthentication,
    )) {
      throw new Error("Execution Control rejected unauthenticated Gateway.");
    }

    const connector = this.options.registry.get(release.connectorName);
    const session = this.options.sessions.create(
      release,
      this.sessionLifetimeMs,
      this.options.sessionIssuanceAuthentication,
    );
    await this.options.audit.record({
      type: "session.created",
      occurredAt: new Date().toISOString(),
      connectorId: connector.connectorId,
      authorizationId: release.authorization.payload.authorizationId,
      sessionId: session.sessionId,
    });

    const request: GatewayExecutionRequest = deepFreeze({
      authorization: release.authorization,
      executableContent: release.executableContent,
      verifiedTransaction: release.verifiedTransaction,
      executionTimestamp: release.executionTimestamp,
      gatewayIdentity: this.options.gatewayIdentity,
      gatewaySession: session,
    });

    try {
      const result = await connector.execute(request);
      await this.options.audit.record({
        type: "execution.completed",
        occurredAt: new Date().toISOString(),
        connectorId: connector.connectorId,
        authorizationId: release.authorization.payload.authorizationId,
        sessionId: session.sessionId,
      });
      return result;
    } catch (error) {
      await this.options.audit.record({
        type: "execution.rejected",
        occurredAt: new Date().toISOString(),
        connectorId: connector.connectorId,
        authorizationId: release.authorization.payload.authorizationId,
        sessionId: session.sessionId,
        reason: error instanceof Error ? error.message : "Unknown rejection",
      });
      throw error;
    }
  }
}
