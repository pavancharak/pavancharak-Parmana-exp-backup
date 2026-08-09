import { PostgresPoolFactory } from "@parmana/storage";

import { InMemoryCallerAuditSink } from "../auth/InMemoryCallerAuditSink.js";
import { SupabaseCallerAuditSink } from "../auth/SupabaseCallerAuditSink.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the CallerAuditSink used by the caller-auth middleware.
 *
 * Test wiring (NODE_ENV=test): InMemoryCallerAuditSink — mirrors
 * createNonceStore.ts's own production/test split for the same reason.
 *
 * Production: SupabaseCallerAuditSink, a durable audit trail. Closes
 * G-13 (docs/VERIFICATION-GAPS.md): caller-authentication events no
 * longer reset on process restart. Fails closed at startup if
 * DATABASE_URL is not configured — never silently falls back to an
 * in-memory sink.
 *
 * TEMPORARY: wired to PostgresPoolFactory (DATABASE_URL), not
 * SupabaseClientFactory (SUPABASE_URL) — see SupabaseCallerAuditSink
 * for why. Revert this wiring back to SupabaseClientFactory /
 * assertSupabaseConfigured once Supabase's PostgREST schema cache
 * issue (SU-437429) is resolved.
 */
export function createCallerAuditSink(): CallerAuditSink {
  if (process.env.NODE_ENV === "test") {
    return new InMemoryCallerAuditSink();
  }

  assertDatabaseUrlConfigured("CallerAuditSink");

  return new SupabaseCallerAuditSink(PostgresPoolFactory.create());
}
