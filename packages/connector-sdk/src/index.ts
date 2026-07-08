/**
 * @parmana/connector-sdk
 *
 * Canonical public API.
 *
 * Connector authoring contracts and reference implementations that extend
 * @parmana/execution-control's SecureConnector / ConnectorRegistry /
 * CredentialVault seams. Every future enterprise connector (Stripe, GitHub,
 * Salesforce, SAP, ServiceNow, Workday, Slack, Jira, Database — all
 * [FUTURE]) is expected to depend on this package rather than
 * execution-control directly.
 */

export * from "./ConnectorTypes.js";
export * from "./ConnectorMetadata.js";
export * from "./ConnectorFactory.js";
export * from "./ConnectorEvidence.js";
export * from "./CredentialProvider.js";
export * from "./CredentialVaultAdapter.js";
export * from "./SdkConnectorExecutor.js";
export * from "./HttpConnector.js";
export * from "./MockConnector.js";
export * from "./CapabilityConnectorPolicy.js";
export * from "./ConnectorRegistry.js";
