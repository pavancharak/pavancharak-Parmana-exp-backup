import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a Razorpay webhook signature: HMAC-SHA256 over the RAW
 * request body bytes, hex-encoded, compared timing-safe against the
 * `X-Razorpay-Signature` header value — same construction as
 * Razorpay's own documented webhook-verification algorithm, and the
 * same timing-safe-comparison style as
 * packages/api/src/auth/StaticKeyAuthenticator.ts.
 *
 * `rawBody` MUST be the exact bytes Razorpay sent on the wire, captured
 * before any JSON parsing (see routes/webhooks-razorpay.ts's use of
 * express.raw() for this route only) — re-serializing a parsed body
 * with JSON.stringify() is not guaranteed to reproduce the original
 * bytes (whitespace, key order, number formatting can all differ) and
 * would make this verification silently unsound.
 *
 * Pure and side-effect-free: callers MUST NOT touch any dedupe/replay
 * store until this returns true (see EnvelopeVerifier.ts's identical
 * verify-before-consume reasoning) — a forged signature must never be
 * able to burn a legitimate event id.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
  const candidate = Buffer.from(signatureHeader, "hex");

  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
