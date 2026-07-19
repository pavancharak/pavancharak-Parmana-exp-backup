import type { RazorpayWebhookEventStore } from "./RazorpayWebhookEventStore.js";
import type { PendingRazorpayWebhookEvent } from "./RazorpayWebhookTypes.js";

/**
 * In-memory RazorpayWebhookEventStore. Mirrors
 * @parmana/envelope-verifier's MemoryNonceStore: correct for tests,
 * loses all state on restart, never used outside NODE_ENV=test (see
 * bootstrap/createRazorpayWebhookEventStore.ts).
 */
export class InMemoryRazorpayWebhookEventStore implements RazorpayWebhookEventStore {
  private readonly seen = new Map<string, PendingRazorpayWebhookEvent>();

  async recordIfUnseen(event: PendingRazorpayWebhookEvent): Promise<boolean> {
    if (this.seen.has(event.eventId)) {
      return false;
    }

    this.seen.set(event.eventId, event);
    return true;
  }

  /** Exposed for tests asserting on what was actually persisted. */
  get events(): readonly PendingRazorpayWebhookEvent[] {
    return Array.from(this.seen.values());
  }

  async listAll(): Promise<readonly PendingRazorpayWebhookEvent[]> {
    return Array.from(this.seen.values());
  }
}
