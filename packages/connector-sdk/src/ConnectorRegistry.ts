import type { CryptoProvider } from "@parmana/crypto";
import {
  InMemoryConnectorRegistry,
  InMemorySecureConnector,
  type ConnectorIdentity,
  type ConnectorPolicy,
  type ConnectorRegistry,
  type SecureConnector,
} from "@parmana/execution-control";

import type { Connector } from "./ConnectorTypes.js";
import { CredentialVaultAdapter } from "./CredentialVaultAdapter.js";
import type { CredentialProvider } from "./CredentialProvider.js";
import type { ConnectorMetadata, ConnectorVersion } from "./ConnectorMetadata.js";
import { SdkConnectorExecutor } from "./SdkConnectorExecutor.js";

export interface ConnectorRegistrationOptions {
  readonly connector: Connector;
  readonly metadata: ConnectorMetadata;
  readonly connectorIdentity: ConnectorIdentity;
  readonly credentialProvider: CredentialProvider;
  readonly policy: ConnectorPolicy;
  readonly gatewayAuthentication: unknown;
  readonly crypto: CryptoProvider;

  /** See SdkConnectorExecutorOptions.expectedVersion. */
  readonly expectedVersion?: ConnectorVersion;
  readonly timeoutMs?: number;
}

export interface ConnectorRegistryEntry {
  readonly connector: Connector;
  readonly metadata: ConnectorMetadata;
  readonly secureConnector: SecureConnector;
}

/**
 * Extends execution-control's ConnectorRegistry with connector-authoring
 * ergonomics: metadata, versioning, health, and credential-provider wiring.
 *
 * Implements execution-control's ConnectorRegistry interface (`get`) by
 * composing an InMemoryConnectorRegistry internally — the existing registry
 * class is used, not modified, and remains a valid drop-in wherever a plain
 * ConnectorRegistry is expected (e.g. ExecutionControlService).
 */
export class ConnectorSdkRegistry implements ConnectorRegistry {
  private readonly inner = new InMemoryConnectorRegistry();
  private readonly entries = new Map<string, ConnectorRegistryEntry>();

  register(options: ConnectorRegistrationOptions): void {
    const connectorId = options.connector.connectorId;
    if (this.entries.has(connectorId)) {
      throw new Error(`Connector already registered: ${connectorId}.`);
    }

    const executor = new SdkConnectorExecutor({
      connector: options.connector,
      metadata: options.metadata,
      credentialProviderId: options.credentialProvider.providerId,
      crypto: options.crypto,
      ...(options.expectedVersion !== undefined
        ? { expectedVersion: options.expectedVersion }
        : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    });

    const secureConnector = new InMemorySecureConnector({
      identity: options.connectorIdentity,
      capabilities: options.connector.capabilities.declared,
      policy: options.policy,
      gatewayAuthentication: options.gatewayAuthentication,
      credentialVault: new CredentialVaultAdapter(options.credentialProvider),
      executor,
    });

    this.inner.register(secureConnector);
    this.entries.set(connectorId, {
      connector: options.connector,
      metadata: options.metadata,
      secureConnector,
    });
  }

  /** Satisfies execution-control's ConnectorRegistry interface, unchanged behavior. */
  get(name: string): SecureConnector {
    return this.inner.get(name);
  }

  entry(name: string): ConnectorRegistryEntry {
    const entry = this.entries.get(name);
    if (entry === undefined) throw new Error(`Unknown connector: ${name}.`);
    return entry;
  }

  list(): readonly ConnectorRegistryEntry[] {
    return [...this.entries.values()];
  }
}
