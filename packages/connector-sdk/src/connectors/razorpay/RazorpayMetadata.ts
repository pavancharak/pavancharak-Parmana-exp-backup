import type {
  ConnectorMetadata,
} from "../../ConnectorMetadata.js";

import {
  healthyNow,
} from "../../ConnectorMetadata.js";

/**
 * Metadata describing the Razorpay connector.
 *
 * This metadata is consumed by the SDK executor and
 * ultimately becomes part of the execution evidence.
 */
export const RazorpayMetadata: ConnectorMetadata = Object.freeze({
  connectorId: "razorpay",

  displayName: "Razorpay",

  version: Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
  }),

  health: healthyNow(),

  description:
    "Razorpay connector for payment lookup and refund execution.",
});
