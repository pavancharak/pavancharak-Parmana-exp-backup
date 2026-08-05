import type { RazorpayDailyRefundLedger } from "./RazorpayDailyRefundLedger.js";

/**
 * In-memory RazorpayDailyRefundLedger, for tests (NODE_ENV=test) and
 * single-process demo/local runs -- mirrors MemoryNonceStore's own
 * "PRODUCTION WARNING: loses all state on restart, production MUST use
 * a persistent implementation" posture exactly (see
 * createRazorpayDailyRefundLedger.ts).
 *
 * Not atomic across processes (an in-memory Map has no cross-process
 * lock), but IS atomic within one process: JavaScript's single-threaded
 * execution means no other reserve()/release() call can interleave
 * between this method's read and write of the same key, so concurrent
 * in-process callers still serialize correctly -- exactly the property
 * SupabaseRazorpayDailyRefundLedger provides across processes via the
 * database's own row lock instead.
 */
export class InMemoryRazorpayDailyRefundLedger
  implements RazorpayDailyRefundLedger
{
  private readonly totals = new Map<string, number>();

  async reserve(
    refundDay: string,
    amountPaise: number,
  ): Promise<{ totalAfterReservation: number }> {
    const current = this.totals.get(refundDay) ?? 0;
    const totalAfterReservation = current + amountPaise;

    this.totals.set(refundDay, totalAfterReservation);

    return { totalAfterReservation };
  }

  async release(
    refundDay: string,
    amountPaise: number,
  ): Promise<void> {
    const current = this.totals.get(refundDay) ?? 0;

    this.totals.set(refundDay, Math.max(0, current - amountPaise));
  }

  /**
   * Current running total for a day. Exposed for tests only.
   */
  totalFor(refundDay: string): number {
    return this.totals.get(refundDay) ?? 0;
  }
}
