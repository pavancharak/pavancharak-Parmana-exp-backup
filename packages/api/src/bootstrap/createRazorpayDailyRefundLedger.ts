import type { RazorpayDailyRefundLedger } from "@parmana/connector-sdk";
import { InMemoryRazorpayDailyRefundLedger } from "@parmana/connector-sdk";
import { PostgresPoolFactory, SupabaseRazorpayDailyRefundLedger } from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the RazorpayDailyRefundLedger used by
 * RazorpaySignalStateVerifier (TD-23 closure, Phase 3B).
 *
 * Test wiring (NODE_ENV=test): InMemoryRazorpayDailyRefundLedger --
 * mirrors createNonceStore.ts's production/test split exactly.
 *
 * Production: SupabaseRazorpayDailyRefundLedger, a durable, atomic
 * counter shared across every process pointed at the same Supabase
 * project. Fails closed at startup if DATABASE_URL is not configured
 * -- never silently falls back to an in-memory ledger, which would
 * silently narrow the daily cap to a single process's uptime with no
 * signal that it happened, the same reasoning createNonceStore.ts
 * already applies to replay protection.
 */
export function createRazorpayDailyRefundLedger(): RazorpayDailyRefundLedger {
  if (process.env.NODE_ENV === "test") {
    return new InMemoryRazorpayDailyRefundLedger();
  }

  assertDatabaseUrlConfigured("RazorpayDailyRefundLedger");

  return new SupabaseRazorpayDailyRefundLedger(PostgresPoolFactory.create());
}
