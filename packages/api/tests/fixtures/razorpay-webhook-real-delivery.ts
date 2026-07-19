/**
 * A real, Razorpay-initiated `refund.processed` webhook delivery.
 *
 * Captured 2026-07-19 by registering a temporary local capture tap
 * (behind a cloudflared quick tunnel) as a Test Mode webhook endpoint in
 * the Razorpay Dashboard, then triggering a real 100-paise refund
 * through this codebase's production POST /execute chain. Razorpay's
 * own webhook infrastructure delivered this event to that endpoint --
 * unlike every other Razorpay webhook fixture/test in this suite, the
 * payload below was never constructed or signed by this codebase's own
 * test code.
 *
 * PII REDACTED after capture (see docs/CLAIMS.md for the full list):
 * payment.entity.email, .contact, .card.{id,iin,issuer,last4,network,
 * token_iin}, .card_id, .token_id, .acquirer_data.auth_code,
 * refund.entity.acquirer_data.arn, and the top-level account_id.
 * Test-mode payment/refund/order entity ids were kept exactly as
 * captured.
 *
 * SIGNATURE NOTE: redacting the body means Razorpay's ORIGINAL signature
 * (computed over the original, unredacted bytes, using a webhook secret
 * that was single-use, dashboard-bound, and deliberately never
 * persisted anywhere) no longer matches these bytes. RAW_BODY_SIGNATURE
 * below is a fresh HMAC-SHA256 computed over RAW_BODY using
 * FIXTURE_SECRET, a dedicated, non-sensitive constant that exists only
 * to make this fixture's signature self-consistent -- it is not
 * Razorpay's real webhook secret and protects nothing. This fixture
 * therefore proves two distinct things: RAW_BODY's *shape* (field
 * paths, types, the payment+refund sibling structure Razorpay actually
 * sends) is exactly what Razorpay's real webhook infrastructure
 * delivered; the signature machinery correctly verifies a correctly
 * signed request carrying that real shape. It is not a claim that
 * RAW_BODY_SIGNATURE is a signature Razorpay itself produced.
 */

export const FIXTURE_SECRET = "razorpay-webhook-real-delivery-fixture-secret";

export const EVENT_ID = "TFCDVxK1IlRsnr";

export const RAW_BODY =
  '{"account_id":"acc_REDACTED00000000","contains":["refund","payment"],"created_at":1784428012,"entity":"event","event":"refund.processed","payload":{"payment":{"entity":{"account_id":null,"acquirer_data":{"auth_code":"000000"},"amount":10000,"amount_refunded":1800,"amount_transferred":0,"bank":null,"base_amount":10000,"captured":true,"card":{"emi":false,"entity":"card","id":"card_REDACTED0000000","iin":"000000","international":false,"issuer":"XXXX","last4":"0000","name":"","network":"Unknown","sub_type":"consumer","token_iin":"000000000","type":"debit"},"card_id":"card_REDACTED0000000","contact":"+910000000000","created_at":1784394440,"currency":"INR","customer_id":null,"description":"#TF2UqPSJwmStxk","device_id":null,"email":"redacted@example.com","entity":"payment","error_code":null,"error_description":null,"error_reason":null,"error_source":null,"error_step":null,"fee":200,"fee_bearer":null,"gateway_merchant_id":null,"gateway_provider":"Razorpay","gateway_terminal_id":null,"id":"pay_TF2fyOjjD6nGL0","internal_status":null,"international":false,"invoice_id":null,"method":"card","notes":[],"optimizer_provider":null,"order_id":"order_TF2VBARob1Jy6f","provider":null,"receiver_type":null,"refund_status":"partial","settled_by":null,"source_channel":"online","status":"captured","store_id":null,"tax":0,"terminal_id":null,"token_id":"token_REDACTED000000","vpa":null,"wallet":null}},"refund":{"entity":{"acquirer_data":{"arn":"00000000000000"},"amount":100,"batch_id":null,"created_at":1784428006,"currency":"INR","entity":"refund","id":"rfnd_TFCCx7bgEk1vGG","notes":{"parmana_txn":"88da0d01-4ae5-4ab5-b848-30083606e64e","reason":"webhook capture exercise"},"payment_id":"pay_TF2fyOjjD6nGL0","receipt":null,"speed_processed":"normal","speed_requested":"normal","status":"processed"}}}}';

/** HMAC-SHA256 of RAW_BODY under FIXTURE_SECRET. See file-level comment. */
export const RAW_BODY_SIGNATURE = "4e18b21df85f3fbb01e5fa88824f6d1fb27b3035bbc8d3e76883a3900dc8edce";

export const PROVENANCE = {
  capturedAt: "2026-07-19T02:27:20.095Z",
  eventType: "refund.processed",
  razorpayPaymentId: "pay_TF2fyOjjD6nGL0",
  razorpayRefundId: "rfnd_TFCCx7bgEk1vGG",
  correlatedBusinessTransactionId: "88da0d01-4ae5-4ab5-b848-30083606e64e",
  deliveryPath: "cloudflared quick tunnel -> local capture tap -> real production webhook route, single delivery, first attempt succeeded",
} as const;
