import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { PostgresPoolFactory } from "@parmana/storage";

import { SupabaseRazorpayWebhookEventStore } from "../../src/webhooks/SupabaseRazorpayWebhookEventStore.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate("Supabase Razorpay Webhook Event Store");

/**
 * Proves razorpay_webhook_events durability and dedupe against a real
 * database, not just the mocked-storage unit tests
 * (packages/api/tests/unit/webhooks/supabase-razorpay-webhook-event-store.test.ts).
 * Requires the razorpay_webhook_events table from
 * supabase/migrations/20260718182238_add_razorpay_webhook_tables.sql
 * to have been applied to the target project.
 *
 * Writes via PostgresPoolFactory (DATABASE_URL), not SupabaseClientFactory
 * — see SupabaseRazorpayWebhookEventStore for why.
 */
describe.skipIf(!databaseConfigured)("SupabaseRazorpayWebhookEventStore (live)", () => {
  it("records an event and rejects a second attempt with the same event id against the same backing", async () => {
    const pool = PostgresPoolFactory.create();
    const store = new SupabaseRazorpayWebhookEventStore(pool);

    const eventId = `test-evt-${crypto.randomUUID()}`;

    const first = await store.recordIfUnseen({
      eventId,
      eventType: "refund.processed",
      payload: '{"event":"refund.processed"}',
      receivedAt: new Date().toISOString(),
    });

    const second = await store.recordIfUnseen({
      eventId,
      eventType: "refund.processed",
      payload: '{"event":"refund.processed","tampered":true}',
      receivedAt: new Date().toISOString(),
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("(restart simulation) an event recorded through one store instance is still recognized as a duplicate by a fresh instance against the same backing", async () => {
    const firstInstance = new SupabaseRazorpayWebhookEventStore(PostgresPoolFactory.create());

    const eventId = `test-evt-restart-${crypto.randomUUID()}`;

    const recordedByFirstInstance = await firstInstance.recordIfUnseen({
      eventId,
      payload: '{"event":"refund.processed"}',
      receivedAt: new Date().toISOString(),
    });

    expect(recordedByFirstInstance).toBe(true);

    const freshInstance = new SupabaseRazorpayWebhookEventStore(PostgresPoolFactory.create());

    const recordedByFreshInstance = await freshInstance.recordIfUnseen({
      eventId,
      payload: '{"event":"refund.processed"}',
      receivedAt: new Date().toISOString(),
    });

    expect(recordedByFreshInstance).toBe(false);
  });

  it("lists a recorded event back via listAll", async () => {
    const pool = PostgresPoolFactory.create();
    const store = new SupabaseRazorpayWebhookEventStore(pool);

    const eventId = `test-evt-list-${crypto.randomUUID()}`;

    await store.recordIfUnseen({
      eventId,
      eventType: "refund.processed",
      payload: '{"event":"refund.processed"}',
      receivedAt: new Date().toISOString(),
    });

    const all = await store.listAll();

    expect(all.some((event) => event.eventId === eventId)).toBe(true);
  });
});
