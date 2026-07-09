import {
  MockConnector,
} from "../../MockConnector.js";

import {
  connectorCapabilities,
} from "../../ConnectorTypes.js";

/**
 * Development Vendor Payment connector.
 *
 * This is a temporary in-memory connector used by the
 * integration tests until the real connector is implemented.
 */
export function createVendorPaymentConnector(): MockConnector {
  return new MockConnector({
    connectorId: "vendor-payment",

    capabilities: connectorCapabilities([
      "vendor-payment",
    ]),
  });
}