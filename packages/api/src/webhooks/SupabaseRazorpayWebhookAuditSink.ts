import type { SupabaseClient } from "@supabase/supabase-js";

import { AuditEventCrypto } from "@parmana/crypto";

import type { RazorpayWebhookAuditEvent, RazorpayWebhookAuditSink } from "./RazorpayWebhookAuditSink.js";

/**
 * Durable, Supabase-backed RazorpayWebhookAuditSink. Mirrors
 * packages/api/src/auth/SupabaseCallerAuditSink.ts exactly: a single
 * insert, no swallowed errors, signed at write time with the same
 * AuditEventCrypto (same signing stack and DEFAULT_KEY_ID as every
 * other signed artifact in this codebase). The webhook route's own
 * call site decides fail-closed behavior on a write failure (mirrors
 * middleware/caller-auth.ts's recordOrFailClosed) — this class does
 * not add error handling of its own.
 */
export class SupabaseRazorpayWebhookAuditSink implements RazorpayWebhookAuditSink {
  private readonly crypto = new AuditEventCrypto();

  constructor(private readonly client: SupabaseClient) {}

  async record(event: RazorpayWebhookAuditEvent): Promise<void> {
    const signature = await this.crypto.sign(event);

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
      signature_json: signature,
    });

    if (error) {
      throw error;
    }
  }
}
