/**
 * @parmana/connector-sdk
 *
 * Canonical public API.
 *
 * Connector authoring contracts: capability definitions, schemas, DTOs,
 * metadata, and the Connector/CredentialProvider interfaces. Passive by
 * design — this package describes capabilities, it does not execute them.
 * Production execution (registration, credential-backed dispatch, the
 * concrete Connector implementations) is owned by @parmana/execution-gateway
 * (Phase 1C).
 */

export * from "./ConnectorTypes.js";
export * from "./ConnectorMetadata.js";
export * from "./ConnectorFactory.js";
export * from "./CredentialProvider.js";
export * from "./MockConnector.js";
