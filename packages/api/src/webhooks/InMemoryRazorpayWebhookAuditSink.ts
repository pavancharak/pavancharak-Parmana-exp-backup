import type { RazorpayWebhookAuditEvent, RazorpayWebhookAuditSink } from "./RazorpayWebhookAuditSink.js";

export class InMemoryRazorpayWebhookAuditSink implements RazorpayWebhookAuditSink {
  private readonly _events: RazorpayWebhookAuditEvent[] = [];

  async record(event: RazorpayWebhookAuditEvent): Promise<void> {
    this._events.push(event);
  }

  get events(): readonly RazorpayWebhookAuditEvent[] {
    return this._events;
  }
}
