import { createHmac, randomUUID } from "node:crypto";

import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { SettlementStatus } from "@parmana/shared";
import {
  MockRazorpayServer,
  PARMANA_TXN_NOTES_KEY,
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
import { executionTrustRecordRepository } from "../../src/repositories.js";
import { RazorpaySettlementProcessor } from "../../src/webhooks/RazorpaySettlementProcessor.js";
import { InMemoryRazorpayWebhookEventStore } from "../../src/webhooks/InMemoryRazorpayWebhookEventStore.js";
import { InMemoryRazorpayWebhookAuditSink } from "../../src/webhooks/InMemoryRazorpayWebhookAuditSink.js";

const KEY_ID = "rzp_test_integration00";
const KEY_SECRET = "integration-test-key-secret";
const WEBHOOK_SECRET = "settlement-integration-webhook-secret";

describe("Razorpay refund lifecycle end to end: execute -> mock refund -> simulated webhook -> settlement", () => {
  let mockServer: MockRazorpayServer | undefined;
  const originalRazorpayBaseUrl = process.env.RAZORPAY_BASE_URL;
  const originalTestKeyId = process.env.RAZORPAY_TEST_KEY_ID;
  const originalTestKeySecret = process.env.RAZORPAY_TEST_KEY_SECRET;

  afterEach(async () => {
    if (mockServer !== undefined) {
      await mockServer.close();
      mockServer = undefined;
    }
    if (originalRazorpayBaseUrl === undefined) {
      delete process.env.RAZORPAY_BASE_URL;
    } else {
      process.env.RAZORPAY_BASE_URL = originalRazorpayBaseUrl;
    }
    if (originalTestKeyId === undefined) {
      delete process.env.RAZORPAY_TEST_KEY_ID;
    } else {
      process.env.RAZORPAY_TEST_KEY_ID = originalTestKeyId;
    }
    if (originalTestKeySecret === undefined) {
      delete process.env.RAZORPAY_TEST_KEY_SECRET;
    } else {
      process.env.RAZORPAY_TEST_KEY_SECRET = originalTestKeySecret;
    }
  });

  function signWebhook(body: string): string {
    return createHmac("sha256", WEBHOOK_SECRET).update(Buffer.from(body)).digest("hex");
  }

  function refundWebhookPayload(eventType: string, razorpayRefundId: string, businessTransactionId: string): string {
    return JSON.stringify({
      entity: "event",
      event: eventType,
      contains: ["refund"],
      payload: {
        refund: {
          entity: {
            id: razorpayRefundId,
            payment_id: "pay_HTTP001",
            amount: 250000,
            status: eventType === "refund.processed" ? "processed" : "failed",
            notes: { [PARMANA_TXN_NOTES_KEY]: businessTransactionId },
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  it(
    "creates a real (mock) refund through POST /execute, then a simulated signed webhook drives it to a fetch-verified, signed settlement confirmation",
    async () => {
      mockServer = new MockRazorpayServer({ keyId: KEY_ID, keySecret: KEY_SECRET });
      await mockServer.listen();
      process.env.RAZORPAY_BASE_URL = mockServer.baseUrl;
      // Hermetic regardless of ambient .env content (see
      // razorpay-refund.integration.test.ts's identical fix): this
      // mock server only recognizes KEY_ID/KEY_SECRET above.
      process.env.RAZORPAY_TEST_KEY_ID = KEY_ID;
      process.env.RAZORPAY_TEST_KEY_SECRET = KEY_SECRET;

      const eventStore = new InMemoryRazorpayWebhookEventStore();
      const auditSink = new InMemoryRazorpayWebhookAuditSink();

      const executionSystem = createExecutionSystem();
      const application = createApplication(executionSystem);
      const app = createApp(application, {
        callerAuth: "disabled",
        razorpayWebhook: { secret: WEBHOOK_SECRET, eventStore, auditSink },
      });

      mockServer.setPayment({
        id: "pay_HTTP001",
        entity: "payment",
        status: "captured",
        amount: 1000000,
        currency: "INR",
        amount_refunded: 0,
        captured: true,
      });

      const businessTransactionId = randomUUID();
      const authorityId = randomUUID();
      const authorizationId = randomUUID();
      const intentId = randomUUID();

      const transaction = {
        businessTransactionId,
        metadata: {
          businessTransactionId,
          correlationId: randomUUID(),
          createdBy: "settlement-integration-test",
          createdAt: new Date(),
        },
        authority: {
          authorityId,
          authorityType: "USER",
          principalId: "settlement-integration-test",
          displayName: "Settlement Integration Test",
          issuedAt: new Date(),
        },
        authorization: {
          authorizationId,
          authorityId,
          purpose: "Settlement integration test",
          authorizedAt: new Date(),
        },
        intent: {
          intentId,
          authorizationId,
          action: RAZORPAY_REFUND_CREATE_CAPABILITY,
          target: "razorpay://payments/pay_HTTP001/refund",
          parameters: Object.freeze({
            paymentId: "pay_HTTP001",
            amountPaise: 250000,
            reason: "customer requested refund",
          }),
          createdAt: new Date(),
        },
        policy: { name: "razorpay-refund", version: "1.0.0", schemaVersion: "1.0.0" },
        signals: {
          paymentStatus: "captured",
          paymentCurrency: "INR",
          refundableRemainingPaise: 1000000,
          requestedRefundAmountPaise: 250000,
          requestedExceedsRemainder: false,
          dailyCumulativeAfterThisRefundPaise: 250000,
        },
        decision: { outcome: "APPROVED" },
        status: "APPROVED",
        createdAt: new Date(),
      };

      const executeResponse = await request(app).post("/execute").send(transaction);
      expect(executeResponse.status).toBe(200);

      const refunds = mockServer.refundsFor("pay_HTTP001");
      expect(refunds).toHaveLength(1);
      const razorpayRefundId = refunds[0]!.id;

      // Simulate a Razorpay-delivered webhook: correctly signed, posted
      // to the real route.
      const webhookBody = refundWebhookPayload("refund.processed", razorpayRefundId, businessTransactionId);
      const webhookResponse = await request(app)
        .post("/webhooks/razorpay")
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Signature", signWebhook(webhookBody))
        .set("X-Razorpay-Event-Id", `evt_${randomUUID()}`)
        .send(webhookBody);

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body.status).toBe("accepted");

      // Settlement processing is out-of-band from the webhook request
      // cycle (M4a's 200 already returned above) — drive it explicitly,
      // against the same mock server the execute call used.
      const settlementConnector = new RazorpayConnector({
        connectorId: "razorpay",
        capabilities: connectorCapabilities([
          RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          RAZORPAY_REFUND_CREATE_CAPABILITY,
          RAZORPAY_REFUND_FETCH_CAPABILITY,
        ]),
        baseUrl: mockServer.baseUrl,
      });
      const settlementCredentialProvider = new StaticCredentialProvider({
        razorpay: { keyId: KEY_ID, keySecret: KEY_SECRET },
      });

      const processor = new RazorpaySettlementProcessor({
        eventStore,
        trustRecords: executionTrustRecordRepository,
        auditSink,
        connector: settlementConnector,
        credentialProvider: settlementCredentialProvider,
      });

      const summary = await processor.runOnce();
      expect(summary.confirmed).toBe(1);

      const record = await executionTrustRecordRepository.findByTransactionId(businessTransactionId);
      expect(record?.settlementConfirmations).toHaveLength(1);
      expect(record?.settlementConfirmations?.[0]?.status).toBe(SettlementStatus.SETTLED);
      expect(record?.settlementConfirmations?.[0]?.razorpayRefundId).toBe(razorpayRefundId);

      // Surfaced on the verification read path, never silently.
      const verifyResponse = await request(app).post("/verify").send({ businessTransactionId });
      expect(verifyResponse.status).toBe(200);

      const verifyGetResponse = await request(app).get(`/verification/${businessTransactionId}`);
      expect(verifyGetResponse.status).toBe(200);
      expect(verifyGetResponse.body.settlement).toBeDefined();
      expect(verifyGetResponse.body.settlement.status).toBe(SettlementStatus.SETTLED);
      expect(verifyGetResponse.body.settlement.razorpayRefundId).toBe(razorpayRefundId);
    },
    30_000,
  );
});
