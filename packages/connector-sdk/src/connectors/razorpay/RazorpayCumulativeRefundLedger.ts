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

  /**
   * Optimistic-concurrency guard closing the TOCTOU window between an
   * earlier cumulativeAmountToday() read (used to build the signals a
   * policy evaluates) and the moment a refund is actually about to
   * execute. Re-reads the current total and appends in one synchronous
   * call -- no `await` anywhere in this method, so no other
   * interleaved async call (e.g. a concurrent requestRefund() for the
   * same scopeId) can observe or mutate the ledger in between the read
   * and the append; JavaScript's run-to-completion semantics make this
   * atomic without any explicit lock.
   *
   * Returns the resulting cumulative total when the append is
   * accepted, or null when appending would push the day's total over
   * capPaise -- rejected, nothing appended. Call this immediately
   * before the capability call that actually executes the refund, not
   * at the point signals are first built; calling it earlier reopens
   * exactly the window this exists to close.
   */
  recordApprovedRefundIfWithinCap(
    scopeId: string,
    amountPaise: number,
    businessTransactionId: string,
    capPaise: number,
    now: Date = this.clock.now(),
  ): number | null {
    const currentTotal = this.cumulativeAmountToday(scopeId, now);
    const newTotal = currentTotal + amountPaise;

    if (newTotal > capPaise) {
      return null;
    }

    this.ledger.append({
      id: businessTransactionId,
      timestamp: now.getTime(),
      type: "razorpay.refund.approved",
      payload: { scopeId, amountPaise, businessTransactionId },
    });

    return newTotal;
  }
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
