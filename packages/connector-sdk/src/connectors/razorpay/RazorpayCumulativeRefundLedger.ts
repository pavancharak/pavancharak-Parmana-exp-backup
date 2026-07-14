import { AppendOnlyLedger } from "@parmana/storage";

import { type Clock, SystemClock } from "@parmana/execution-control";

export interface RazorpayRefundLedgerPayload {
  readonly scopeId: string;
  readonly amountPaise: number;
  readonly businessTransactionId: string;
}

/**
 * Tracks cumulative authorized refund amounts per policy scope (e.g. a
 * session id) per calendar day, using the existing storage layer's
 * AppendOnlyLedger rather than a new persistence mechanism. Only
 * successfully authorized-and-executed refunds are recorded; a denied
 * refund is never appended.
 */
export class RazorpayCumulativeRefundLedger {
  private readonly ledger = new AppendOnlyLedger<RazorpayRefundLedgerPayload>();

  constructor(private readonly clock: Clock = new SystemClock()) {}

  recordApprovedRefund(scopeId: string, amountPaise: number, businessTransactionId: string): void {
    const now = this.clock.now();
    this.ledger.append({
      id: businessTransactionId,
      timestamp: now.getTime(),
      type: "razorpay.refund.approved",
      payload: { scopeId, amountPaise, businessTransactionId },
    });
  }

  /** Sum of amounts already recorded for scopeId on the same calendar day (UTC) as `now`. */
  cumulativeAmountToday(scopeId: string, now: Date = this.clock.now()): number {
    const dayKey = dateKey(now);
    return this.ledger
      .all()
      .filter((entry) => entry.payload.scopeId === scopeId && dateKey(new Date(entry.timestamp)) === dayKey)
      .reduce((sum, entry) => sum + entry.payload.amountPaise, 0);
  }
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
