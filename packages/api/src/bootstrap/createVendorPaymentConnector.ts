import {
  MockConnector,
  connectorCapabilities,
} from "@parmana/connector-sdk";

/**
 * Creates the Vendor Payment connector.
 *
 * This is the production bootstrap for the
 * vendor-payment connector. The current
 * implementation uses MockConnector until the
 * real enterprise connector is introduced.
 */
export function createVendorPaymentConnector(): MockConnector {
  return new MockConnector({
    connectorId: "vendor-payment",

    capabilities: connectorCapabilities([
    "payments:execute",
]),
  });
}