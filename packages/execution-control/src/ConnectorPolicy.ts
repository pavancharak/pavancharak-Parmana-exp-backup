import type {
  ConnectorAuthenticator,
  ConnectorPolicy,
  GatewayExecutionRequest,
  SecureConnector,
} from "./types.js";
import { InMemoryGatewaySessionStore } from "./GatewaySessionStore.js";

export class DefaultConnectorPolicy implements ConnectorPolicy {
  constructor(
    private readonly authenticator: ConnectorAuthenticator,
    private readonly sessions: InMemoryGatewaySessionStore,
  ) {}

  async assertAllowed(
    request: GatewayExecutionRequest,
    connector: SecureConnector,
    authentication: unknown,
  ): Promise<void> {
    if (!this.authenticator.authenticateGateway(request.gatewayIdentity, authentication)) {
      throw new Error("Connector rejected unauthenticated Gateway.");
    }
    if (!this.authenticator.authenticateConnector(connector.identity)) {
      throw new Error("Connector identity is not trusted.");
    }
    if (!request.verifiedTransaction.authorizationVerified ||
      !request.verifiedTransaction.executableContentVerified ||
      !request.verifiedTransaction.replayCheckPassed) {
      throw new Error("Connector requires a verified transaction.");
    }
    if (!connector.capabilities.includes(request.executableContent.action)) {
      throw new Error("Connector capability does not allow this action.");
    }
    if (!this.sessions.consume(request, connector.connectorId)) {
      throw new Error("Connector rejected invalid, expired, modified, or reused Gateway session.");
    }
  }
}
