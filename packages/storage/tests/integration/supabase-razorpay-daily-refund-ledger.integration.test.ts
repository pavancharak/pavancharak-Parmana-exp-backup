import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { PostgresPoolFactory } from "../../src/postgres/PostgresPoolFactory.js";
import { SupabaseRazorpayDailyRefundLedger } from "../../src/supabase/SupabaseRazorpayDailyRefundLedger.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate(
  "Supabase Razorpay Daily Refund Ledger",
);

/**
 * Phase 3D certification follow-up: closes the test-coverage gap the
 * certification disclosed for TD-23/Phase 3B's daily-cumulative-refund
 * cap -- `InMemoryRazorpayDailyRefundLedger.test.ts` proves atomicity
 * for the in-memory (NODE_ENV=test) implementation under 50-way
 * concurrency, and `SupabaseNonceStore` has an equivalent live-database
 * proof (`supabase-nonce-store.integration.test.ts`), but until this
 * file, `SupabaseRazorpayDailyRefundLedger` -- the actual production
 * implementation -- had no direct proof of its own atomicity against a
 * real, concurrently-writing Postgres connection. The `INSERT ... ON
 * CONFLICT (refund_day) DO UPDATE ... RETURNING` mechanism is sound by
 * construction (the same idiom already proven live for
 * `consumed_nonces`), but "sound by construction" and "proven under
 * real concurrent load" are different claims; this file supplies the
 * second one.
 *
 * Requires the razorpay_daily_refund_reservations table from
 * supabase/migrations/20260805170000_add_razorpay_daily_refund_
 * reservations.sql to have been applied to the target project.
 */
describe.skipIf(!databaseConfigured)(
  "SupabaseRazorpayDailyRefundLedger (live)",
  () => {
    it("reserves an amount and reflects it in totalAfterReservation", async () => {
      const pool = PostgresPoolFactory.create();
      const ledger = new SupabaseRazorpayDailyRefundLedger(pool);

      const refundDay = uniqueTestRefundDay();

      const { totalAfterReservation } = await ledger.reserve(
        refundDay,
        50_000,
      );

      expect(totalAfterReservation).toBe(50_000);
    });

    it(
      "(concurrency, live database) two simultaneous reserve() calls for the same refund_day sum exactly, with no lost update",
      async () => {
        const pool = PostgresPoolFactory.create();
        const ledger = new SupabaseRazorpayDailyRefundLedger(pool);

        const refundDay = uniqueTestRefundDay();

        // Real concurrent transactions against Postgres, not a simulated
        // interleaving -- the same proof InMemoryRazorpayDailyRefundLedger's
        // 50-way unit test provides for the in-memory implementation,
        // but here it is the database's own row lock on the refund_day
        // primary key, not application code, that must make this
        // atomic. A lost update (both calls observing the pre-reservation
        // total) would surface here as one of the two returned totals
        // being wrong -- exactly the TOCTOU race TD-23/Phase 3B closed.
        const [a, b] = await Promise.all([
          ledger.reserve(refundDay, 100_000),
          ledger.reserve(refundDay, 300_000),
        ]);

        const totals = [a.totalAfterReservation, b.totalAfterReservation].sort(
          (x, y) => x - y,
        );

        // Whichever call committed first sees only its own contribution;
        // whichever committed second sees both -- there is no interleaving
        // where both see only their own amount (a lost update) or where
        // the final total is anything other than the exact sum.
        expect(totals).toEqual([100_000, 400_000]);
      },
    );

    it(
      "(concurrency, live database) 20 concurrent reservations for the same refund_day sum exactly, matching the in-memory implementation's own 50-way proof",
      async () => {
        const pool = PostgresPoolFactory.create();
        const ledger = new SupabaseRazorpayDailyRefundLedger(pool);

        const refundDay = uniqueTestRefundDay();
        const amountPerReservation = 10_000;
        const reservationCount = 20;

        const results = await Promise.all(
          Array.from({ length: reservationCount }, () =>
            ledger.reserve(refundDay, amountPerReservation),
          ),
        );

        const finalTotal = Math.max(
          ...results.map((r) => r.totalAfterReservation),
        );
        expect(finalTotal).toBe(amountPerReservation * reservationCount);

        // No two concurrent calls observed (and reported) the same
        // pre-reservation total -- every returned totalAfterReservation
        // is distinct.
        const totals = results.map((r) => r.totalAfterReservation);
        expect(new Set(totals).size).toBe(reservationCount);
      },
    );

    it("release() reduces the reserved total and never goes below zero", async () => {
      const pool = PostgresPoolFactory.create();
      const ledger = new SupabaseRazorpayDailyRefundLedger(pool);

      const refundDay = uniqueTestRefundDay();

      await ledger.reserve(refundDay, 200_000);
      await ledger.release(refundDay, 150_000);

      const { totalAfterReservation } = await ledger.reserve(refundDay, 0);
      expect(totalAfterReservation).toBe(50_000);

      // Releasing far more than was ever reserved floors at zero (the
      // schema's own chk_reserved_paise_non_negative constraint, and
      // SupabaseRazorpayDailyRefundLedger.release()'s GREATEST(...,0)),
      // rather than going negative or erroring.
      await ledger.release(refundDay, 1_000_000);
      const { totalAfterReservation: floored } = await ledger.reserve(
        refundDay,
        0,
      );
      expect(floored).toBe(0);
    });
  },
);

/**
 * A refund_day far enough in the future that it can never collide with
 * a real production reservation for "today," and randomized so
 * concurrent CI/local runs of this same suite don't collide with each
 * other -- the same isolation strategy the sibling nonce-store live
 * test achieves via crypto.randomUUID() nonces, adapted to this table's
 * DATE-keyed primary key.
 */
function uniqueTestRefundDay(): string {
  const farFutureDays = 20_000 + crypto.randomInt(0, 10_000);
  const date = new Date(Date.now() + farFutureDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}
