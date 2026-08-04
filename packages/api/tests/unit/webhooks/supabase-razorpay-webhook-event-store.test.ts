import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import { SupabaseRazorpayWebhookEventStore } from "../../../src/webhooks/SupabaseRazorpayWebhookEventStore.js";
import type { PendingRazorpayWebhookEvent } from "../../../src/webhooks/RazorpayWebhookTypes.js";

/**
 * Fake pg.Pool backing store, mirroring
 * packages/storage/tests/unit/supabase-nonce-store.test.ts's own fake
 * pool convention: a real Postgres PRIMARY KEY on event_id makes a
 * duplicate insert atomic at the database, not in application code;
 * this fake mimics that with a synchronous has-check.
 */
function createFakePool(): { pool: Pool; rows: Map<string, Record<string, unknown>> } {
  const rows = new Map<string, Record<string, unknown>>();

  const pool = {
    query(sql: string, values?: readonly unknown[]) {
      if (sql.includes("INSERT INTO razorpay_webhook_events")) {
        const [eventId, eventType, payload, receivedAt] = values as [
          string,
          string | null,
          string,
          string,
        ];

        if (rows.has(eventId)) {
          return Promise.reject({
            code: "23505",
            message: 'duplicate key value violates unique constraint "razorpay_webhook_events_pkey"',
          });
        }

        rows.set(eventId, {
          event_id: eventId,
          event_type: eventType,
          payload,
          received_at: receivedAt,
        });

        return Promise.resolve({ rows: [], rowCount: 1 });
      }

      if (sql.includes("SELECT event_id, event_type, payload, received_at")) {
        return Promise.resolve({
          rows: [...rows.values()].sort(
            (a, b) =>
              (a.received_at as string).localeCompare(b.received_at as string),
          ),
        });
      }

      throw new Error(`test fake: unexpected SQL: ${sql}`);
    },
  };

  return { pool: pool as unknown as Pool, rows };
}

const EVENT: PendingRazorpayWebhookEvent = {
  eventId: "evt_ABC123",
  eventType: "refund.processed",
  payload: '{"event":"refund.processed"}',
  receivedAt: "2026-01-01T00:00:00.000Z",
};

describe("SupabaseRazorpayWebhookEventStore", () => {
  it("records a fresh event id and returns true", async () => {
    const { pool } = createFakePool();
    const store = new SupabaseRazorpayWebhookEventStore(pool);

    await expect(store.recordIfUnseen(EVENT)).resolves.toBe(true);
  });

  it("maps a 23505 unique-violation on a replayed event id to false, not an error, and does not overwrite the original", async () => {
    const { pool } = createFakePool();
    const store = new SupabaseRazorpayWebhookEventStore(pool);

    const first = await store.recordIfUnseen(EVENT);
    const second = await store.recordIfUnseen({
      ...EVENT,
      payload: '{"event":"refund.processed","amount":999}',
    });

    expect(first).toBe(true);
    expect(second).toBe(false);

    const all = await store.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.payload).toBe(EVENT.payload);
  });

  it("fails closed: a non-unique-violation storage error propagates rather than being treated as a duplicate", async () => {
    const pool = {
      query() {
        return Promise.reject({ code: "08006", message: "connection failure" });
      },
    } as unknown as Pool;

    const store = new SupabaseRazorpayWebhookEventStore(pool);

    await expect(store.recordIfUnseen(EVENT)).rejects.toMatchObject({
      code: "08006",
    });
  });

  it("lists every recorded event, ordered by receivedAt, nulling absent eventType", async () => {
    const { pool } = createFakePool();
    const store = new SupabaseRazorpayWebhookEventStore(pool);

    await store.recordIfUnseen({
      eventId: "evt_1",
      payload: '{"event":"unrecognized"}',
      receivedAt: "2026-01-01T00:00:01.000Z",
    });

    await store.recordIfUnseen({
      eventId: "evt_2",
      eventType: "refund.processed",
      payload: '{"event":"refund.processed"}',
      receivedAt: "2026-01-01T00:00:02.000Z",
    });

    const all = await store.listAll();

    expect(all).toHaveLength(2);
    expect(all[0]?.eventId).toBe("evt_1");
    expect(all[0]?.eventType).toBeUndefined();
    expect(all[1]?.eventId).toBe("evt_2");
    expect(all[1]?.eventType).toBe("refund.processed");
  });
});
