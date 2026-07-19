/**
 * Razorpay webhook audit trail. Mirrors
 * packages/api/src/auth/CallerAuditSink.ts's shape and reasoning
 * exactly, for the same layer-separation reason: a webhook delivery
 * that never verifies has no eventId and no parsed payload (nothing
 * downstream of signature verification has been trusted yet), so this
 * stays a separate sink rather than an extension of
 * RazorpayWebhookEventStore or execution-control's ExecutionAuditSink.
 *
 * Deliberately narrow, matching the payload-handling rule (treat the
 * body as untrusted input even post-verification): only eventId,
 * eventType, and payment/refund ids ever appear here — never full
 * payload contents, and never any card/customer field Razorpay's
 * payload may include.
 *
 * The four "settlement.*" types (added in M4b) record the SEPARATE
 * outcome of settlement PROCESSING — draining a stored event into a
 * fetch-verified SettlementConfirmation — as opposed to the three
 * webhook.* types above, which record the outcome of the inbound HTTP
 * delivery itself (M4a). A webhook.received event and its eventual
 * settlement.confirmed/settlement.failed event are two separate audit
 * rows, often minutes apart (settlement processing is out-of-band).
 */
export interface RazorpayWebhookAuditEvent {
  readonly type:
    | "webhook.received"
    | "webhook.duplicate"
    | "webhook.rejected"
    | "settlement.confirmed"
    | "settlement.failed"
    | "settlement.parked"
    | "settlement.park_exhausted";
  readonly occurredAt: string;
  readonly route: string;

  /** Present once the signature has verified (received, duplicate, or a post-verification rejection). */
  readonly eventId?: string;

  /** Present when the (verified) payload's top-level `event` field parsed as a string. */
  readonly eventType?: string;

  /** Present when a `payload.payment.entity.id` was extractable from a verified payload. */
  readonly paymentId?: string;

  /** Present when a `payload.refund.entity.id` was extractable from a verified payload. */
  readonly refundId?: string;

  /** Present only on "webhook.rejected". A short diagnostic reason, never signature/secret material. */
  readonly reason?: string;

  /**
   * Elevated-severity marker. Set to "flagged" on settlement.failed and
   * settlement.park_exhausted — the two outcomes that mean "a refund's
   * lifecycle did not close cleanly and needs a human to look," never
   * silence. Absent (not merely false) on every routine outcome.
   */
  readonly severity?: "flagged";

  /** Present on settlement.confirmed/settlement.failed: the SettlementConfirmation this event produced. */
  readonly confirmationId?: string;

  /** Present on settlement.confirmed/settlement.failed: the fetched (not webhook-claimed) refund status. */
  readonly fetchedRefundStatus?: string;
}

export interface RazorpayWebhookAuditSink {
  record(event: RazorpayWebhookAuditEvent): Promise<void>;
}
