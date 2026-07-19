/**
 * Parmana Trust Core
 *
 * Settlement Confirmation
 *
 * A second, independently signed trust artifact that closes a
 * connector-mediated action's lifecycle (e.g. a Razorpay refund) once
 * its externally-reported outcome has been independently fetch-verified
 * against the connector's own API — never inferred from an inbound
 * webhook claim alone. Append-only, like every other artifact on an
 * Execution Trust Record: creating one never mutates the original
 * Receipt, the Trust Record's own trustRecordHash/signature, or any
 * other existing artifact.
 */
export enum SettlementStatus {
  SETTLED = "SETTLED",
  SETTLEMENT_FAILED = "SETTLEMENT_FAILED",
}

export interface SettlementConfirmation {
  /**
   * Unique Settlement Confirmation identifier.
   */
  readonly confirmationId: string;

  /**
   * Business Transaction this confirmation closes the lifecycle for.
   */
  readonly businessTransactionId: string;

  /**
   * The Receipt this confirmation references, when one existed on the
   * Trust Record at confirmation time. Undefined when no Receipt had
   * been generated yet — a confirmation never blocks on one existing.
   */
  readonly receiptId?: string;

  /**
   * The webhook event id (X-Razorpay-Event-Id) that triggered
   * processing. The webhook itself is only ever a doorbell: this field
   * records what prompted the fetch-verify, not evidence of the
   * outcome — fetchedRefundStatus below is the fetched, authoritative
   * state.
   */
  readonly webhookEventId: string;

  /**
   * The Razorpay refund id this confirmation is about.
   */
  readonly razorpayRefundId: string;

  /**
   * SETTLED when the fetched refund status was "processed";
   * SETTLEMENT_FAILED otherwise. Derived exclusively from
   * fetchedRefundStatus, never from the webhook's own claimed event
   * type.
   */
  readonly status: SettlementStatus;

  /**
   * The refund's status exactly as fetched from Razorpay's API at
   * confirmation time (e.g. "processed", "failed", "pending") — the
   * authoritative state this confirmation records.
   */
  readonly fetchedRefundStatus: string;

  /**
   * Hash of this Settlement Confirmation.
   */
  readonly confirmationHash: string;

  /**
   * Digital signature over the Settlement Confirmation.
   */
  readonly signature: string;

  /**
   * Signing algorithm.
   */
  readonly algorithm: string;

  /**
   * UTC timestamp when this Settlement Confirmation was issued.
   */
  readonly issuedAt: Date;
}
