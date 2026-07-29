/**
 * Parmana Settlement Confirmation.
 *
 * A second, independently signed trust artifact (M4b) closing a
 * connector-mediated action's lifecycle (e.g. a Razorpay refund) once
 * its externally-reported outcome has been independently fetch-verified
 * against the connector's own API. See
 * schemas/common/settlement-confirmation.schema.json.
 */

export type SettlementStatus = "SETTLED" | "SETTLEMENT_FAILED";

export interface SettlementConfirmation {
  readonly confirmationId: string;

  readonly businessTransactionId: string;

  readonly receiptId?: string;

  readonly webhookEventId: string;

  readonly razorpayRefundId: string;

  readonly status: SettlementStatus;

  readonly fetchedRefundStatus: string;

  readonly confirmationHash: string;

  readonly signature: string;

  readonly algorithm: string;

  readonly issuedAt: Date;
}
