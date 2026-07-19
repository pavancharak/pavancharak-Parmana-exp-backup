import type { SupabaseClient } from "@supabase/supabase-js";

import type { RazorpayWebhookAuditEvent, RazorpayWebhookAuditSink } from "./RazorpayWebhookAuditSink.js";

/**
 * Durable, Supabase-backed RazorpayWebhookAuditSink. Mirrors
 * packages/api/src/auth/SupabaseCallerAuditSink.ts exactly: a single
 * insert, no swallowed errors. The webhook route's own call site
 * decides fail-closed behavior on a write failure (mirrors
 * middleware/caller-auth.ts's recordOrFailClosed) — this class does
 * not add error handling of its own.
 */
export class SupabaseRazorpayWebhookAuditSink implements RazorpayWebhookAuditSink {
  constructor(private readonly client: SupabaseClient) {}

  async record(event: RazorpayWebhookAuditEvent): Promise<void> {
    const { error } = await this.client.from("razorpay_webhook_audit_events").insert({
      type: event.type,
      occurred_at: event.occurredAt,
      route: event.route,
      event_id: event.eventId ?? null,
      event_type: event.eventType ?? null,
      payment_id: event.paymentId ?? null,
      refund_id: event.refundId ?? null,
      reason: event.reason ?? null,
      severity: event.severity ?? null,
      confirmation_id: event.confirmationId ?? null,
      fetched_refund_status: event.fetchedRefundStatus ?? null,
    });

    if (error) {
      throw error;
    }
  }
}
