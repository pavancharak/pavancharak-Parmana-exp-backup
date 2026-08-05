import {
  MockConnector,
  connectorCapabilities,
  type Connector,
} from "@parmana/connector-sdk";

/**
 * Creates the Vendor Payment connector, or undefined when the
 * payments:execute capability should not be registered at all.
 *
 * No real enterprise vendor-payment integration exists yet (Phase 2A,
 * see docs/architecture/phase2a-production-connectors.md). Until one
 * does, this capability has no production implementation — mirrors
 * createRazorpayCredentialProvider.ts's / createHubSpotCredentialProvider.ts's
 * existing "return undefined, let createConnectorRegistry.ts skip
 * registration, fail closed via ConnectorSdkRegistry's own 'No connector
 * registered for capability' error" pattern, rather than substituting a
 * scripted MockConnector that would fabricate a signed successful
 * execution for a real payment that never happened.
 *
 * Test (NODE_ENV=test): MockConnector, exactly as before — unit and
 * integration tests, and any explicit demo/local run started with
 * NODE_ENV=test, keep working unchanged.
 *
 * Production: undefined. payments:execute has no connector to resolve
 * to until a real adapter is implemented inside execution-gateway (see
 * "Adding a new vendor" in docs/developer/extending-parmana.md).
 */
export function createVendorPaymentConnector(): Connector | undefined {
  if (process.env.NODE_ENV !== "test") {
    return undefined;
  }

  return new MockConnector({
    connectorId: "vendor-payment",

    capabilities: connectorCapabilities([
      "payments:execute",
    ]),
  });
}