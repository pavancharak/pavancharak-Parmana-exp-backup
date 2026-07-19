import type { SupabaseClient } from "@supabase/supabase-js";

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
 */
export class SupabaseRazorpayWebhookEventStore implements RazorpayWebhookEventStore {
  constructor(private readonly client: SupabaseClient) {}

  async recordIfUnseen(event: PendingRazorpayWebhookEvent): Promise<boolean> {
    const { error } = await this.client.from("razorpay_webhook_events").insert({
      event_id: event.eventId,
      event_type: event.eventType ?? null,
      payload: event.payload,
      received_at: event.receivedAt,
    });

    if (error) {
      if (isUniqueViolation(error)) {
        return false;
      }

      throw error;
    }

    return true;
  }

  async listAll(): Promise<readonly PendingRazorpayWebhookEvent[]> {
    const { data, error } = await this.client
      .from("razorpay_webhook_events")
      .select("event_id, event_type, payload, received_at")
      .order("received_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      eventId: row.event_id as string,
      payload: row.payload as string,
      receivedAt: row.received_at as string,
      ...(row.event_type !== null ? { eventType: row.event_type as string } : {}),
    }));
  }
}
