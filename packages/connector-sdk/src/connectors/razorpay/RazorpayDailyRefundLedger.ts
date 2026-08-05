/**
 * Razorpay Daily Refund Ledger (TD-23 closure, Phase 3B).
 *
 * A small, dedicated atomicity primitive -- not a general transaction
 * history -- for the one specific race Phase 3A/3B identified: two
 * concurrent razorpay:refund-create requests each reading the same
 * "cumulative so far" total before either commits, and both passing
 * the daily cumulative cap independently.
 *
 * The check-then-write race is closed by making the write itself the
 * check: reserve() atomically adds amountPaise to the running total
 * for the given day and returns the total AFTER that addition, in one
 * database round trip (an UPSERT ... RETURNING for the Supabase
 * implementation). Two concurrent reserve() calls for the same day are
 * serialized by the database's own row lock on that day's row -- the
 * same class of atomicity `consumed_nonces`'s PRIMARY KEY and
 * `razorpay_webhook_events`'s primary-key-as-atomicity already rely
 * on, applied here to an additive counter instead of a uniqueness
 * check.
 *
 * release() is the immediate, synchronous compensation for a
 * reservation that (as reported by reserve()'s own return value) would
 * push the day's total over the cap -- called within the same
 * verification pass that called reserve(), before any connector call
 * is ever made. It is not a downstream, execution-outcome-dependent
 * hook (see RazorpaySignalStateVerifier.ts's own comment on why: no
 * such hook exists in RuntimeEngine's execute() flow, and adding one
 * is out of this phase's Preserve list).
 */
export interface RazorpayDailyRefundLedger {
  /**
   * Atomically adds amountPaise to refundDay's running total and
   * returns the total immediately after that addition.
   *
   * refundDay is a UTC calendar date, "YYYY-MM-DD".
   */
  reserve(
    refundDay: string,
    amountPaise: number,
  ): Promise<{ totalAfterReservation: number }>;

  /**
   * Atomically subtracts amountPaise from refundDay's running total
   * (floored at zero), compensating for a reservation that must not
   * count -- because it pushed the total over the cap and the request
   * was rejected before any connector call was made.
   */
  release(
    refundDay: string,
    amountPaise: number,
  ): Promise<void>;
}
