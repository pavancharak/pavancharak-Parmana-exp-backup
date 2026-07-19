/**
 * The built-in test-mode placeholder webhook secret
 * (resolveRazorpayWebhookSecret.ts's fallback when no real test-mode
 * secret is configured). Mirrors RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID/
 * SECRET (@parmana/connector-sdk) for the outbound connector credential —
 * this is the inbound equivalent. Structurally unusable for verifying
 * anything not signed by it: HMAC-SHA256 requires the exact secret to
 * produce a matching signature, so a request signed with any other
 * secret (real or otherwise) is rejected exactly as it would be against
 * a real secret — there is no special-casing of this value anywhere in
 * verification.
 */
export const RAZORPAY_WEBHOOK_TEST_MODE_PLACEHOLDER_SECRET = "razorpay-webhook-test-placeholder-secret";

/**
 * A verified, deduplicated Razorpay webhook event, persisted for
 * downstream processing in a future session (M4b — see docs/CLAIMS.md).
 * Deliberately narrow: the raw payload is kept verbatim (M4b will need
 * to re-parse it in full), but only the two fields useful for indexing/
 * routing before that happens are pulled out.
 */
export interface PendingRazorpayWebhookEvent {
  readonly eventId: string;
  readonly eventType?: string;
  readonly payload: string;
  readonly receivedAt: string;
}
