import request from "supertest";
import { describe, expect, it } from "vitest";

import type { ExecutionTrustRecord } from "@parmana/shared";
import { SettlementStatus } from "@parmana/shared";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";
import {
  MockRazorpayServer,
  RazorpayConnector,
  RAZORPAY_PAYMENT_FETCH_CAPABILITY,
  RAZORPAY_REFUND_CREATE_CAPABILITY,
  RAZORPAY_REFUND_FETCH_CAPABILITY,
  StaticCredentialProvider,
  connectorCapabilities,
} from "@parmana/connector-sdk";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";
import { InMemoryRazorpayWebhookEventStore } from "../../src/webhooks/InMemoryRazorpayWebhookEventStore.js";
import { InMemoryRazorpayWebhookAuditSink } from "../../src/webhooks/InMemoryRazorpayWebhookAuditSink.js";
import { RazorpaySettlementProcessor } from "../../src/webhooks/RazorpaySettlementProcessor.js";
import type { PendingRazorpayWebhookEvent } from "../../src/webhooks/RazorpayWebhookTypes.js";

import { EVENT_ID, FIXTURE_SECRET, PROVENANCE, RAW_BODY, RAW_BODY_SIGNATURE } from "../fixtures/razorpay-webhook-real-delivery.js";

const KEY_ID = "rzp_test_realfixture00";
const KEY_SECRET = "real-fixture-test-key-secret";

/**
 * Hermetically replays a real, Razorpay-initiated webhook delivery
 * (captured live -- see the fixture file's header comment and
 * docs/CLAIMS.md). Both cases below always run in the default suite:
 * nothing here depends on live credentials or the original (single-use,
 * never-persisted) dashboard secret -- see the fixture's SIGNATURE NOTE
 * for exactly what is, and is not, being proven by verifying
 * RAW_BODY_SIGNATURE.
 *
 * The point of this file is not "a webhook gets accepted" -- every other
 * webhook test in this suite already proves that against a synthetic,
 * self-signed payload. It is that the REAL shape Razorpay sent (the
 * payment+refund sibling structure under `payload`, the exact field
 * paths) satisfies every assumption extractSafeMetadata
 * (routes/webhooks-razorpay.ts) and RazorpaySettlementProcessor's
 * correlation-extraction logic made about that shape while this
 * codebase had only synthetic payloads to test against.
 */
describe("Razorpay real webhook fixture replay (real delivery, hermetic)", () => {
  it("real shape: the real payload verifies and extracts through the actual /webhooks/razorpay route", async () => {
    const executionSystem = createExecutionSystem();
    const application = createApplication(executionSystem);
    const eventStore = new InMemoryRazorpayWebhookEventStore();
    const auditSink = new InMemoryRazorpayWebhookAuditSink();

    const app = createApp(application, {
      callerAuth: "disabled",
      razorpayWebhook: { secret: FIXTURE_SECRET, eventStore, auditSink },
    });

    const response = await request(app)
      .post("/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", RAW_BODY_SIGNATURE)
      .set("X-Razorpay-Event-Id", EVENT_ID)
      .send(RAW_BODY);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("accepted");

    expect(eventStore.events).toHaveLength(1);
    expect(eventStore.events[0]?.eventId).toBe(EVENT_ID);
    expect(eventStore.events[0]?.eventType).toBe(PROVENANCE.eventType);
    expect(eventStore.events[0]?.payload).toBe(RAW_BODY);

    // extractSafeMetadata's real-shape assumptions: paymentId is read
    // from payload.payment.entity.id and refundId from
    // payload.refund.entity.id -- both siblings under `payload`, exactly
    // as Razorpay actually sends for a refund event (synthetic payloads
    // elsewhere in this suite already assumed this; this is the first
    // proof against a real delivery).
    const received = auditSink.events.find((e) => e.type === "webhook.received");
    expect(received).toBeDefined();
    expect(received?.eventId).toBe(EVENT_ID);
    expect(received?.eventType).toBe(PROVENANCE.eventType);
    expect(received?.paymentId).toBe(PROVENANCE.razorpayPaymentId);
    expect(received?.refundId).toBe(PROVENANCE.razorpayRefundId);
  });

  it("real shape: RazorpaySettlementProcessor correlates and settles the real payload", async () => {
    const server = new MockRazorpayServer({ keyId: KEY_ID, keySecret: KEY_SECRET });
    await server.listen();

    try {
      server.setPayment({
        id: PROVENANCE.razorpayPaymentId,
        entity: "payment",
        status: "captured",
        amount: 10000,
        currency: "INR",
        amount_refunded: 1800,
        captured: true,
      });

      // Seeds a refund carrying the EXACT id the real captured payload
      // references (the mock server's normal create flow always assigns
      // a random id, which cannot reproduce a real externally-captured
      // one -- see MockRazorpayServer.seedExistingRefund's own comment).
      server.seedExistingRefund(PROVENANCE.razorpayPaymentId, {
        id: PROVENANCE.razorpayRefundId,
        entity: "refund",
        payment_id: PROVENANCE.razorpayPaymentId,
        amount: 100,
        currency: "INR",
        status: "processed",
        speed_processed: "normal",
        notes: {},
        created_at: Math.floor(Date.now() / 1000),
      });

      const connector = new RazorpayConnector({
        connectorId: "razorpay",
        capabilities: connectorCapabilities([
          RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          RAZORPAY_REFUND_CREATE_CAPABILITY,
          RAZORPAY_REFUND_FETCH_CAPABILITY,
        ]),
        baseUrl: server.baseUrl,
      });
      const credentialProvider = new StaticCredentialProvider({ razorpay: { keyId: KEY_ID, keySecret: KEY_SECRET } });

      const trustRecords = new MemoryExecutionTrustRecordRepository();
      const businessTransactionId = PROVENANCE.correlatedBusinessTransactionId;
      await trustRecords.create({
        trustRecordId: `trust-${businessTransactionId}`,
        businessTransactionId,
        transaction: { businessTransactionId },
        overrides: [],
        executions: [],
        verifications: [],
        receipts: [
          {
            receiptId: `receipt-${businessTransactionId}`,
            businessTransactionId,
            trustRecordHash: "fixture-trust-record-hash",
            receiptHash: "fixture-receipt-hash",
            signature: "fixture-receipt-signature",
            algorithm: "ed25519",
            issuedAt: new Date("2026-07-19T00:00:00.000Z"),
          },
        ],
        settlementConfirmations: [],
        trustRecordHash: "fixture-trust-record-hash",
        signature: { algorithm: "ed25519", keyId: "default", value: "fixture-signature", signedAt: new Date() },
        createdAt: new Date("2026-07-19T00:00:00.000Z"),
        updatedAt: new Date("2026-07-19T00:00:00.000Z"),
      } as unknown as ExecutionTrustRecord);

      const eventStore = new InMemoryRazorpayWebhookEventStore();
      const auditSink = new InMemoryRazorpayWebhookAuditSink();
      const processor = new RazorpaySettlementProcessor({ eventStore, trustRecords, auditSink, connector, credentialProvider });

      // The real captured payload, fed directly into the same
      // correlation-extraction logic (parsePayload) every other
      // settlement-processor test only ever exercises with a synthetic
      // payload this codebase constructed itself.
      const event: PendingRazorpayWebhookEvent = {
        eventId: EVENT_ID,
        eventType: PROVENANCE.eventType,
        payload: RAW_BODY,
        receivedAt: PROVENANCE.capturedAt,
      };

      const outcome = await processor.processEvent(event);
      expect(outcome).toBe("confirmed");

      const record = await trustRecords.findByTransactionId(businessTransactionId);
      expect(record?.settlementConfirmations).toHaveLength(1);

      const confirmation = record!.settlementConfirmations![0]!;
      expect(confirmation.status).toBe(SettlementStatus.SETTLED);
      expect(confirmation.fetchedRefundStatus).toBe("processed");
      expect(confirmation.razorpayRefundId).toBe(PROVENANCE.razorpayRefundId);
      expect(confirmation.webhookEventId).toBe(EVENT_ID);
    } finally {
      await server.close();
    }
  });
});
