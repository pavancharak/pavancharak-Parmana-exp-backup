import {
  RAZORPAY_PAYMENT_FETCH_CAPABILITY,
  RAZORPAY_REFUND_CREATE_CAPABILITY,
  RAZORPAY_REFUND_FETCH_CAPABILITY,
  connectorCapabilities,
  type Connector,
} from "@parmana/connector-sdk";
import { createGatewayRazorpayConnector } from "@parmana/execution-gateway";

/**
 * Creates the Razorpay connector.
 *
 * baseUrl defaults to the Gateway's own default (Razorpay's real
 * production API) unless RAZORPAY_BASE_URL is explicitly set. That
 * variable exists solely as a test seam so an integration test can point
 * this connector at a hermetic MockRazorpayServer instead — it is never
 * set in production, so production traffic reaches the real Razorpay API
 * unless an operator deliberately opts out.
 */
export function createRazorpayConnector(): Connector {
  return createGatewayRazorpayConnector({
    connectorId: "razorpay",

    capabilities: connectorCapabilities([
      RAZORPAY_PAYMENT_FETCH_CAPABILITY,
      RAZORPAY_REFUND_CREATE_CAPABILITY,
      RAZORPAY_REFUND_FETCH_CAPABILITY,
    ]),

    ...(process.env.RAZORPAY_BASE_URL !== undefined
      ? { baseUrl: process.env.RAZORPAY_BASE_URL }
      : {}),
  });
}
