import type { Connector, RazorpayConnectorOptions } from "@parmana/connector-sdk";

import { GatewayRazorpayAdapter } from "./GatewayRazorpayAdapter.js";

/**
 * Creates the production Razorpay Connector.
 *
 * Returns the stable Connector interface, not the concrete
 * GatewayRazorpayAdapter class — callers never construct or depend on the
 * adapter implementation directly.
 */
export function createGatewayRazorpayConnector(options: RazorpayConnectorOptions): Connector {
  return new GatewayRazorpayAdapter(options);
}
