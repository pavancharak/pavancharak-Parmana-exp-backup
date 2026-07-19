import { describe, expect, it } from "vitest";

import { InMemoryRazorpayWebhookEventStore } from "../../../src/webhooks/InMemoryRazorpayWebhookEventStore.js";

describe("InMemoryRazorpayWebhookEventStore", () => {
  it("records a fresh event id and returns true", async () => {
    const store = new InMemoryRazorpayWebhookEventStore();

    const recorded = await store.recordIfUnseen({
      eventId: "evt_ABC123",
      eventType: "refund.processed",
      payload: '{"event":"refund.processed"}',
      receivedAt: new Date().toISOString(),
    });

    expect(recorded).toBe(true);
    expect(store.events).toHaveLength(1);
    expect(store.events[0]?.eventId).toBe("evt_ABC123");
  });

  it("rejects a replayed event id as a duplicate and does not overwrite the original record", async () => {
    const store = new InMemoryRazorpayWebhookEventStore();

    const first = await store.recordIfUnseen({
      eventId: "evt_DUP001",
      eventType: "refund.processed",
      payload: '{"event":"refund.processed","amount":100}',
      receivedAt: "2026-01-01T00:00:00.000Z",
    });

    const second = await store.recordIfUnseen({
      eventId: "evt_DUP001",
      eventType: "refund.processed",
      payload: '{"event":"refund.processed","amount":999}',
      receivedAt: "2026-01-01T00:00:05.000Z",
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(store.events).toHaveLength(1);
    expect(store.events[0]?.payload).toContain("100");
  });
});
