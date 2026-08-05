import { describe, expect, it } from "vitest";

import { InMemoryRazorpayDailyRefundLedger } from "../../src/connectors/razorpay/InMemoryRazorpayDailyRefundLedger.js";

/**
 * TD-23 closure, Phase 3B. Proves the atomic reserve()/release()
 * contract RazorpaySignalStateVerifier depends on to close the daily
 * cumulative cap's caller-declared-value gap.
 */
describe("InMemoryRazorpayDailyRefundLedger", () => {
  it("starts every unseen day at zero", async () => {
    const ledger = new InMemoryRazorpayDailyRefundLedger();

    expect(ledger.totalFor("2026-08-05")).toBe(0);
  });

  it("reserve() returns the running total after the addition, not just the delta", async () => {
    const ledger = new InMemoryRazorpayDailyRefundLedger();

    const first = await ledger.reserve("2026-08-05", 100_000);
    expect(first.totalAfterReservation).toBe(100_000);

    const second = await ledger.reserve("2026-08-05", 250_000);
    expect(second.totalAfterReservation).toBe(350_000);
  });

  it("reserve() tracks each day independently", async () => {
    const ledger = new InMemoryRazorpayDailyRefundLedger();

    await ledger.reserve("2026-08-05", 500_000);
    await ledger.reserve("2026-08-06", 700_000);

    expect(ledger.totalFor("2026-08-05")).toBe(500_000);
    expect(ledger.totalFor("2026-08-06")).toBe(700_000);
  });

  it("release() subtracts the given amount from the day's running total", async () => {
    const ledger = new InMemoryRazorpayDailyRefundLedger();

    await ledger.reserve("2026-08-05", 500_000);
    await ledger.release("2026-08-05", 200_000);

    expect(ledger.totalFor("2026-08-05")).toBe(300_000);
  });

  it("release() floors at zero rather than going negative", async () => {
    const ledger = new InMemoryRazorpayDailyRefundLedger();

    await ledger.reserve("2026-08-05", 100_000);
    await ledger.release("2026-08-05", 999_999);

    expect(ledger.totalFor("2026-08-05")).toBe(0);
  });

  it("(adversarial, Task 3.5) many concurrent reservations for the same day sum exactly, with no lost updates", async () => {
    const ledger = new InMemoryRazorpayDailyRefundLedger();

    // 50 concurrent reservations of 40,000 paise each. If reserve() were
    // a read-then-write race (the exact TOCTOU shape Phase 2L/3A/3B
    // identified) rather than a single atomic operation, some of these
    // concurrent calls could observe a stale total and the final sum
    // would undercount. In-process, JavaScript's single-threaded
    // execution already guarantees this specific race cannot occur
    // (no other reserve() call can interleave between this method's
    // own read and write of the same Map key) -- this test proves that
    // guarantee holds under real concurrent load, not just by
    // inspection of the source.
    const reservations = Array.from({ length: 50 }, () =>
      ledger.reserve("2026-08-05", 40_000),
    );

    const results = await Promise.all(reservations);

    expect(ledger.totalFor("2026-08-05")).toBe(50 * 40_000);

    // Every individual reservation's own reported total is unique and
    // internally consistent with strict serialization: sorting the
    // reported totals recovers exactly 40_000, 80_000, ..., 2_000_000
    // -- proof no two concurrent calls both saw (and both used) the
    // same pre-reservation total.
    const totals = results.map((result) => result.totalAfterReservation).sort((a, b) => a - b);
    const expected = Array.from({ length: 50 }, (_, index) => (index + 1) * 40_000);
    expect(totals).toEqual(expected);
  });
});
