import type { Pool } from "pg";

import { isUniqueViolation } from "@parmana/storage";

import type { RazorpayWebhookEventStore } from "./RazorpayWebhookEventStore.js";
import type { PendingRazorpayWebhookEvent } from "./RazorpayWebhookTypes.js";

/**
 * Durable, Supabase-backed RazorpayWebhookEventStore. Mirrors
 * @parmana/storage's SupabaseNonceStore exactly (see that file's
 * comment): consumption is a single INSERT into
 * razorpay_webhook_events, whose PRIMARY KEY on event_id is the entire
 * atomicity mechanism — no check-then-set. Two concurrent inserts of
 * the same event id race at the database; exactly one succeeds, the
 * other fails with a 23505 unique_violation, mapped here to "already
 * consumed" (returns false) rather than a thrown failure.
 *
 * Fail-closed: any other error (network failure, missing table, etc.)
 * is rethrown, not swallowed — propagates to the webhook route's
 * catch/next(error), which surfaces as a real failure rather than a
 * silent 200 that lied about persisting the event.
 *
 * Writes via a direct Postgres connection (PostgresPoolFactory), not
 * supabase-js/PostgREST — part of removing PostgREST from every
 * Supabase-backed table's failure modes, not just the audit sinks
 * that broke first (see SupabaseCallerAuditSink for the originating
 * incident).
 */
export class SupabaseRazorpayWebhookEventStore implements RazorpayWebhookEventStore {
  constructor(private readonly pool: Pool) {}

  async recordIfUnseen(event: PendingRazorpayWebhookEvent): Promise<boolean> {
    try {
      await this.pool.query(INSERT_RAZORPAY_WEBHOOK_EVENT_SQL, [
        event.eventId,
        event.eventType ?? null,
        event.payload,
        event.receivedAt,
      ]);

      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }

      throw error;
    }
  }

  async listAll(): Promise<readonly PendingRazorpayWebhookEvent[]> {
    const { rows } = await this.pool.query(SELECT_ALL_RAZORPAY_WEBHOOK_EVENTS_SQL);

    return (rows as RazorpayWebhookEventRow[]).map((row) => ({
      eventId: row.event_id,
      payload: row.payload,
      receivedAt:
        row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at,
      ...(row.event_type !== null ? { eventType: row.event_type } : {}),
    }));
  }
}

const INSERT_RAZORPAY_WEBHOOK_EVENT_SQL = `
  INSERT INTO razorpay_webhook_events (event_id, event_type, payload, received_at)
  VALUES ($1, $2, $3, $4)
`;

const SELECT_ALL_RAZORPAY_WEBHOOK_EVENTS_SQL = `
  SELECT event_id, event_type, payload, received_at
  FROM razorpay_webhook_events
  ORDER BY received_at ASC
`;

interface RazorpayWebhookEventRow {
  readonly event_id: string;
  readonly event_type: string | null;
  readonly payload: string;
  readonly received_at: string | Date;
}
