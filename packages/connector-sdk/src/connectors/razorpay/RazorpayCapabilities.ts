import type { ConnectorCapabilities } from "../../ConnectorTypes.js";
import type { RazorpayRefundSpeed } from "./RazorpayTypes.js";

/**
 * Razorpay capability identifiers and connector-configuration/parameter
 * DTOs. Pure metadata — no execution logic. The executable connector
 * (GatewayRazorpayAdapter) lives in @parmana/execution-gateway and imports
 * these back from here (Phase 1C).
 */

export const RAZORPAY_PAYMENT_FETCH_CAPABILITY = "razorpay:payment-fetch";
export const RAZORPAY_REFUND_CREATE_CAPABILITY = "razorpay:refund-create";
export const RAZORPAY_REFUND_FETCH_CAPABILITY = "razorpay:refund-fetch";

export interface RazorpayConnectorOptions {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;

  /** Defaults to Razorpay's production base URL; tests and the tutorial override with a local mock server. */
  readonly baseUrl?: string;
}

export interface RazorpayRefundCreateParameters {
  readonly paymentId: string;
  readonly amountPaise?: number;
  readonly speed?: RazorpayRefundSpeed;
  readonly reason?: string;
  readonly receipt?: string;
}

export interface RazorpayPaymentFetchParameters {
  readonly paymentId: string;
}

export interface RazorpayRefundFetchParameters {
  readonly refundId: string;
}
