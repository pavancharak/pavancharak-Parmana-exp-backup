import { PostgresPoolFactory } from "@parmana/storage";

import { InMemoryRazorpayWebhookAuditSink } from "../webhooks/InMemoryRazorpayWebhookAuditSink.js";
import { SupabaseRazorpayWebhookAuditSink } from "../webhooks/SupabaseRazorpayWebhookAuditSink.js";
import type { RazorpayWebhookAuditSink } from "../webhooks/RazorpayWebhookAuditSink.js";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the RazorpayWebhookAuditSink used by the webhook route.
 * Mirrors createCallerAuditSink.ts's test/production split exactly.
 *
 * TEMPORARY: wired to PostgresPoolFactory (DATABASE_URL), not
 * SupabaseClientFactory (SUPABASE_URL) — see
 * SupabaseRazorpayWebhookAuditSink for why. Revert alongside
 * createCallerAuditSink.ts once Supabase's PostgREST schema cache
 * issue (SU-437429) is resolved.
 */
export function createRazorpayWebhookAuditSink(): RazorpayWebhookAuditSink {
  if (process.env.NODE_ENV === "test") {
    return new InMemoryRazorpayWebhookAuditSink();
  }

  assertDatabaseUrlConfigured("RazorpayWebhookAuditSink");

  return new SupabaseRazorpayWebhookAuditSink(PostgresPoolFactory.create());
}
