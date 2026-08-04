import { PostgresPoolFactory } from "@parmana/storage";

import { InMemoryRazorpayWebhookEventStore } from "../webhooks/InMemoryRazorpayWebhookEventStore.js";
import { SupabaseRazorpayWebhookEventStore } from "../webhooks/SupabaseRazorpayWebhookEventStore.js";
import type { RazorpayWebhookEventStore } from "../webhooks/RazorpayWebhookEventStore.js";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the RazorpayWebhookEventStore used by the webhook route.
 *
 * Test wiring (NODE_ENV=test): InMemoryRazorpayWebhookEventStore —
 * mirrors createNonceStore.ts's own test/production split.
 *
 * Production: SupabaseRazorpayWebhookEventStore, a durable store shared
 * across every process pointed at the same Supabase project, so a
 * webhook delivery retried after a process restart is still correctly
 * recognized as a duplicate. Fails closed at startup if DATABASE_URL
 * is not configured — never silently falls back to an in-memory store.
 *
 * Wired to PostgresPoolFactory (DATABASE_URL), not SupabaseClientFactory
 * (SUPABASE_URL) — SupabaseRazorpayWebhookEventStore now writes via a
 * direct Postgres connection, removing PostgREST from this store's
 * failure modes entirely.
 */
export function createRazorpayWebhookEventStore(): RazorpayWebhookEventStore {
  if (process.env.NODE_ENV === "test") {
    return new InMemoryRazorpayWebhookEventStore();
  }

  assertDatabaseUrlConfigured("RazorpayWebhookEventStore");

  return new SupabaseRazorpayWebhookEventStore(PostgresPoolFactory.create());
}
