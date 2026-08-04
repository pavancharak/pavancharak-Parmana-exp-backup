/**
 * ExecutionGateway's connector-execution layer.
 *
 * Canonical production implementation of the connector-registration,
 * credential-backed execution, and execution-dispatch responsibilities
 * execution-control's seams (ConnectorRegistry, CredentialVault,
 * ConnectorExecutor) define. Migrated from @parmana/connector-sdk (Phase
 * 1C) — connector packages retain only capability definitions, schemas,
 * metadata, and interfaces; this is where those get wired into a real,
 * running execution path.
 */

export * from "./ConnectorEvidence.js";
export * from "./CredentialVaultAdapter.js";
export * from "./SdkConnectorExecutor.js";
export * from "./GatewayCapabilityConnectorPolicy.js";
export * from "./GatewayConnectorRegistry.js";
export * from "./GatewayRazorpayAdapter.js";
export * from "./GatewayHubSpotAdapter.js";
export * from "./GatewayHttpAdapter.js";
