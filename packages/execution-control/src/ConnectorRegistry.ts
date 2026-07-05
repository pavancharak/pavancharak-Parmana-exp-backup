import type { ConnectorRegistry, SecureConnector } from "./types.js";

export class InMemoryConnectorRegistry implements ConnectorRegistry {
  private readonly connectors = new Map<string, SecureConnector>();

  constructor(connectors: readonly SecureConnector[] = []) {
    for (const connector of connectors) this.register(connector);
  }

  register(connector: SecureConnector): void {
    if (this.connectors.has(connector.connectorId)) {
      throw new Error(`Connector already registered: ${connector.connectorId}.`);
    }
    this.connectors.set(connector.connectorId, connector);
  }

  get(name: string): SecureConnector {
    const connector = this.connectors.get(name);
    if (connector === undefined) throw new Error(`Unknown connector: ${name}.`);
    return connector;
  }
}
