import { SupabaseClientFactory } from "@parmana/storage";

import { InMemoryRazorpayWebhookAuditSink } from "../webhooks/InMemoryRazorpayWebhookAuditSink.js";
import { SupabaseRazorpayWebhookAuditSink } from "../webhooks/SupabaseRazorpayWebhookAuditSink.js";
import type { RazorpayWebhookAuditSink } from "../webhooks/RazorpayWebhookAuditSink.js";

import { assertSupabaseConfigured } from "./assertSupabaseConfigured.js";

/**
 * Creates the RazorpayWebhookAuditSink used by the webhook route.
 * Mirrors createCallerAuditSink.ts's test/production split exactly.
 */
export function createRazorpayWebhookAuditSink(): RazorpayWebhookAuditSink {
  if (process.env.NODE_ENV === "test") {
    return new InMemoryRazorpayWebhookAuditSink();
  }

  assertSupabaseConfigured("RazorpayWebhookAuditSink");

  return new SupabaseRazorpayWebhookAuditSink(SupabaseClientFactory.create());
}
