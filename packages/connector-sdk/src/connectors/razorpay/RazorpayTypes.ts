/**
 * Razorpay domain types.
 *
 * Shapes here follow exactly the fields this milestone's spec states for
 * Razorpay's Payments and Refunds APIs. Where the spec did not state a
 * behavior, we implement conservatively and mark the assumption
 * verified-against-mock-only in the connector itself, not here.
 */

export type RazorpayPaymentStatus =
  | "created"
  | "authorized"
  | "captured"
  | "refunded"
  | "failed";

export interface RazorpayPayment {
  readonly id: string;
  readonly entity: "payment";
  readonly status: RazorpayPaymentStatus;
  readonly amount: number;
  readonly currency: string;
  readonly amount_refunded: number;
  readonly captured: boolean;
}

export type RazorpayRefundStatus = "pending" | "processed" | "failed";
export type RazorpayRefundSpeed = "normal" | "optimum";

export interface RazorpayRefund {
  readonly id: string;
  readonly entity: "refund";
  readonly payment_id: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: RazorpayRefundStatus;
  readonly speed_processed?: RazorpayRefundSpeed;
  readonly notes: Readonly<Record<string, string>>;
  readonly receipt?: string;
  readonly created_at: number;
}

export interface RazorpayRefundList {
  readonly entity: "collection";
  readonly count: number;
  readonly items: readonly RazorpayRefund[];
}

/** Fixed notes key the parmana transaction id is always written under. */
export const PARMANA_TXN_NOTES_KEY = "parmana_txn";

/**
 * The built-in test-mode placeholder credential (createRazorpayCredential
 * Provider.ts's fallback when no real test-mode credential is configured).
 * Exported here, shared by both that fallback and RazorpayConnector's own
 * fail-closed guard against sending it to a real endpoint, so the two
 * sides can never drift apart into comparing different literals.
 */
export const RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID = "rzp_test_integration00";
export const RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_SECRET = "integration-test-key-secret";

export interface RazorpayCredentialValue {
  readonly keyId: string;
  readonly keySecret: string;
}

export function isRazorpayCredentialValue(value: unknown): value is RazorpayCredentialValue {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.keyId === "string" && typeof candidate.keySecret === "string";
}

/** Redacted form of a Razorpay key_id safe to place in receipts: first 8 chars plus ellipsis. */
export function redactRazorpayKeyId(keyId: string): string {
  return `${keyId.slice(0, 8)}...`;
}
