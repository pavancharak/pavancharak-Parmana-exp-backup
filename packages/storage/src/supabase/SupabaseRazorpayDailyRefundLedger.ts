import type { Pool } from "pg";

import type { RazorpayDailyRefundLedger } from "@parmana/connector-sdk";

/**
 * Durable, Supabase-backed RazorpayDailyRefundLedger (TD-23 closure,
 * Phase 3B). Closes the daily-cumulative-cap TOCTOU race Phase 2L/3A
 * identified: replay-nonce-store-style atomicity (see SupabaseNonceStore),
 * applied to an additive daily counter instead of a uniqueness check.
 *
 * Atomicity: reserve() is a single INSERT ... ON CONFLICT DO UPDATE ...
 * RETURNING statement -- there is no separate read-then-write. Two
 * concurrent reserve() calls for the same refund_day race at the database;
 * Postgres serializes them via the row's own lock, and each caller
 * receives the running total as of its own reservation, correctly
 * reflecting the other's already-applied contribution when it commits
 * first.
 *
 * Writes via a direct Postgres connection (PostgresPoolFactory), matching
 * every other Supabase-backed table introduced since the PostgREST
 * incident (see SupabaseNonceStore's own comment for the full history).
 */
export class SupabaseRazorpayDailyRefundLedger
  implements RazorpayDailyRefundLedger
{
  constructor(private readonly pool: Pool) {}

  async reserve(
    refundDay: string,
    amountPaise: number,
  ): Promise<{ totalAfterReservation: number }> {
    const { rows } = await this.pool.query<{ reserved_paise: string }>(
      RESERVE_SQL,
      [refundDay, amountPaise],
    );

    return {
      totalAfterReservation: Number(rows[0]!.reserved_paise),
    };
  }

  async release(
    refundDay: string,
    amountPaise: number,
  ): Promise<void> {
    await this.pool.query(RELEASE_SQL, [refundDay, amountPaise]);
  }
}

const RESERVE_SQL = `
  INSERT INTO razorpay_daily_refund_reservations (refund_day, reserved_paise, updated_at)
  VALUES ($1, $2, now())
  ON CONFLICT (refund_day)
  DO UPDATE SET
    reserved_paise = razorpay_daily_refund_reservations.reserved_paise + EXCLUDED.reserved_paise,
    updated_at = now()
  RETURNING reserved_paise
`;

const RELEASE_SQL = `
  UPDATE razorpay_daily_refund_reservations
  SET reserved_paise = GREATEST(reserved_paise - $2, 0), updated_at = now()
  WHERE refund_day = $1
`;
