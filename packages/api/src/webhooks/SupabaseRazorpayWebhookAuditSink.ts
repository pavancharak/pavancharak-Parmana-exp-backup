import type { Pool } from "pg";

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
 *
 * TEMPORARY WORKAROUND: writes via a direct Postgres connection (see
 * PostgresPoolFactory), not supabase-js — PostgREST's schema cache is
 * stuck refusing to see signature_json on this table (Supabase ticket
 * SU-437429), confirmed at Supabase's PostgREST layer specifically,
 * not the database or this codebase. Raw SQL bypasses PostgREST's
 * REST layer (and its schema cache) entirely. Revert to supabase-js
 * (`this.client.from("razorpay_webhook_audit_events").insert(...)`,
 * as before) once Supabase confirms the cache issue is resolved.
 */
const INSERT_RAZORPAY_WEBHOOK_AUDIT_EVENT_SQL = `
  INSERT INTO razorpay_webhook_audit_events
    (type, occurred_at, route, event_id, event_type, payment_id, refund_id,
     reason, severity, confirmation_id, fetched_refund_status, signature_json)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
`;

export class SupabaseRazorpayWebhookAuditSink implements RazorpayWebhookAuditSink {
  private readonly crypto = new AuditEventCrypto();

  constructor(private readonly pool: Pool) {}

  async record(event: RazorpayWebhookAuditEvent): Promise<void> {
    const signature = await this.crypto.sign(event);

    await this.pool.query(INSERT_RAZORPAY_WEBHOOK_AUDIT_EVENT_SQL, [
      event.type,
      event.occurredAt,
      event.route,
      event.eventId ?? null,
      event.eventType ?? null,
      event.paymentId ?? null,
      event.refundId ?? null,
      event.reason ?? null,
      event.severity ?? null,
      event.confirmationId ?? null,
      event.fetchedRefundStatus ?? null,
      JSON.stringify(signature),
    ]);
  }
}
