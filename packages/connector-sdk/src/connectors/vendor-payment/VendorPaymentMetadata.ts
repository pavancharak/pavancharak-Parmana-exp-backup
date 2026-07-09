import type {
  ConnectorMetadata,
} from "../../ConnectorMetadata.js";

import {
  healthyNow,
} from "../../ConnectorMetadata.js";

/**
 * Metadata describing the Vendor Payment connector.
 *
 * This metadata is consumed by the SDK executor and
 * ultimately becomes part of the execution evidence.
 */
export const VendorPaymentMetadata: ConnectorMetadata = Object.freeze({
  connectorId: "vendor-payment",

  displayName: "Vendor Payment",

  version: Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
  }),

  health: healthyNow(),

  description:
    "Development connector for vendor payment execution.",
});