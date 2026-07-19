import { createHmac, randomUUID } from "node:crypto";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";
import { InMemoryRazorpayWebhookEventStore } from "../../src/webhooks/InMemoryRazorpayWebhookEventStore.js";
import { InMemoryRazorpayWebhookAuditSink } from "../../src/webhooks/InMemoryRazorpayWebhookAuditSink.js";

const WEBHOOK_SECRET = "integration-test-webhook-secret";
const ROUTE = "/webhooks/razorpay";

function sign(body: string, secret: string = WEBHOOK_SECRET): string {
  return createHmac("sha256", secret).update(Buffer.from(body)).digest("hex");
}

function buildApp() {
  const executionSystem = createExecutionSystem();
  const application = createApplication(executionSystem);
  const eventStore = new InMemoryRazorpayWebhookEventStore();
  const auditSink = new InMemoryRazorpayWebhookAuditSink();

  const app = createApp(application, {
    callerAuth: "disabled",
    razorpayWebhook: { secret: WEBHOOK_SECRET, eventStore, auditSink },
  });

  return { app, eventStore, auditSink };
}

function refundEventBody(eventId: string, refundId: string, paymentId: string): string {
  // Deliberately compact-then-not: real Razorpay payloads are not
  // pretty-printed, but the fields/shape mirror what Razorpay documents
  // for a refund.processed webhook.
  return JSON.stringify({
    entity: "event",
    event: "refund.processed",
    contains: ["refund"],
    payload: {
      refund: { entity: { id: refundId, payment_id: paymentId, amount: 100, status: "processed" } },
      payment: { entity: { id: paymentId } },
    },
    created_at: Math.floor(Date.now() / 1000),
    _eventIdForTest: eventId,
  });
}

describe("Razorpay webhook (HTTP boundary)", () => {
  it("accepts a validly signed, fresh event: 200, persisted, audited as received", async () => {
    const { app, eventStore, auditSink } = buildApp();

    const eventId = `evt_${randomUUID()}`;
    const refundId = `rfnd_${randomUUID()}`;
    const paymentId = `pay_${randomUUID()}`;
    const body = refundEventBody(eventId, refundId, paymentId);
    const signature = sign(body);

    const response = await request(app)
      .post(ROUTE)
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("accepted");

    expect(eventStore.events).toHaveLength(1);
    expect(eventStore.events[0]?.eventId).toBe(eventId);
    expect(eventStore.events[0]?.eventType).toBe("refund.processed");
    expect(eventStore.events[0]?.payload).toBe(body);

    const received = auditSink.events.find((e) => e.type === "webhook.received");
    expect(received).toBeDefined();
    expect(received?.eventId).toBe(eventId);
    expect(received?.eventType).toBe("refund.processed");
    expect(received?.refundId).toBe(refundId);
    expect(received?.paymentId).toBe(paymentId);
  });

  it("acknowledges a replayed event id without persisting or reprocessing it, and audits it as a duplicate", async () => {
    const { app, eventStore, auditSink } = buildApp();

    const eventId = `evt_${randomUUID()}`;
    const body = refundEventBody(eventId, `rfnd_${randomUUID()}`, `pay_${randomUUID()}`);
    const signature = sign(body);

    const first = await request(app)
      .post(ROUTE)
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);

    const second = await request(app)
      .post(ROUTE)
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("acknowledged");

    expect(eventStore.events).toHaveLength(1);

    const duplicateAudit = auditSink.events.find((e) => e.type === "webhook.duplicate");
    expect(duplicateAudit).toBeDefined();
    expect(duplicateAudit?.eventId).toBe(eventId);

    expect(auditSink.events.filter((e) => e.type === "webhook.received")).toHaveLength(1);
  });

  it("rejects a bad signature with 401, persists nothing, and audits it without ever touching the dedupe store", async () => {
    const { app, eventStore, auditSink } = buildApp();

    const eventId = `evt_${randomUUID()}`;
    const body = refundEventBody(eventId, `rfnd_${randomUUID()}`, `pay_${randomUUID()}`);
    const wrongSignature = sign(body, "wrong-secret-entirely");

    const response = await request(app)
      .post(ROUTE)
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", wrongSignature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);

    expect(response.status).toBe(401);
    expect(eventStore.events).toHaveLength(0);

    const rejected = auditSink.events.find((e) => e.type === "webhook.rejected");
    expect(rejected).toBeDefined();
    expect(rejected?.reason).toBe("invalid signature");
    // Nothing payload-derived leaks into an audit record for an unverified request.
    expect(rejected?.eventId).toBeUndefined();
    expect(rejected?.eventType).toBeUndefined();
  });

  it("rejects a request with no signature header at all: 401, audited, dedupe store untouched", async () => {
    const { app, eventStore, auditSink } = buildApp();

    const eventId = `evt_${randomUUID()}`;
    const body = refundEventBody(eventId, `rfnd_${randomUUID()}`, `pay_${randomUUID()}`);

    const response = await request(app)
      .post(ROUTE)
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);

    expect(response.status).toBe(401);
    expect(eventStore.events).toHaveLength(0);

    const rejected = auditSink.events.find((e) => e.type === "webhook.rejected");
    expect(rejected?.reason).toBe("missing signature header");
  });

  it("rejects a validly signed request missing the event id header: 401, audited, dedupe store untouched", async () => {
    const { app, eventStore, auditSink } = buildApp();

    const body = refundEventBody("unused", `rfnd_${randomUUID()}`, `pay_${randomUUID()}`);
    const signature = sign(body);

    const response = await request(app)
      .post(ROUTE)
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .send(body);

    expect(response.status).toBe(401);
    expect(eventStore.events).toHaveLength(0);

    const rejected = auditSink.events.find((e) => e.type === "webhook.rejected");
    expect(rejected?.reason).toBe("missing event id header");
    // Signature WAS verified here, so eventType is safely extractable —
    // unlike the bad-signature case above.
    expect(rejected?.eventType).toBe("refund.processed");
  });

  it("verify-before-consume ordering: a forged signature carrying a fresh event id never consumes that event id", async () => {
    const { app, eventStore, auditSink } = buildApp();

    const eventId = `evt_${randomUUID()}`;
    const body = refundEventBody(eventId, `rfnd_${randomUUID()}`, `pay_${randomUUID()}`);
    const forgedSignature = sign(body, "attacker-does-not-know-the-real-secret");

    const forgedAttempt = await request(app)
      .post(ROUTE)
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", forgedSignature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);

    expect(forgedAttempt.status).toBe(401);
    expect(eventStore.events).toHaveLength(0);

    // The legitimate request, with the SAME event id, must still be
    // accepted as fresh — the forged attempt above must never have
    // burned it. If verify-then-consume ordering were violated (consume
    // before/without verifying), this would incorrectly come back as a
    // duplicate.
    const realSignature = sign(body);

    const legitimateAttempt = await request(app)
      .post(ROUTE)
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", realSignature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);

    expect(legitimateAttempt.status).toBe(200);
    expect(legitimateAttempt.body.status).toBe("accepted");
    expect(eventStore.events).toHaveLength(1);

    const duplicateAudits = auditSink.events.filter((e) => e.type === "webhook.duplicate");
    expect(duplicateAudits).toHaveLength(0);
  });

  it("verifies over the exact wire bytes end to end: a pretty-printed body whose JSON.stringify differs byte-wise still verifies", async () => {
    const { app, eventStore } = buildApp();

    const eventId = `evt_${randomUUID()}`;
    const compact = refundEventBody(eventId, `rfnd_${randomUUID()}`, `pay_${randomUUID()}`);
    const parsed = JSON.parse(compact) as Record<string, unknown>;
    const prettyPrinted = JSON.stringify(parsed, null, 2);
    expect(prettyPrinted).not.toBe(compact);

    const signature = sign(prettyPrinted);

    const response = await request(app)
      .post(ROUTE)
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(prettyPrinted);

    expect(response.status).toBe(200);
    expect(eventStore.events[0]?.payload).toBe(prettyPrinted);
  });

  it("mounts no route at all when razorpayWebhook is disabled — a request 404s", async () => {
    const executionSystem = createExecutionSystem();
    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled", razorpayWebhook: "disabled" });

    const body = refundEventBody("evt_x", "rfnd_x", "pay_x");

    const response = await request(app)
      .post(ROUTE)
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", sign(body))
      .set("X-Razorpay-Event-Id", "evt_x")
      .send(body);

    expect(response.status).toBe(404);
  });
});
