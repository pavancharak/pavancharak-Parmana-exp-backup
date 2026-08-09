import type { ExecutionTrustRecord } from "@parmana/shared";
import { SettlementStatus } from "@parmana/shared";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";
import {
  MockRazorpayServer,
  RAZORPAY_PAYMENT_FETCH_CAPABILITY,
  RAZORPAY_REFUND_CREATE_CAPABILITY,
  RAZORPAY_REFUND_FETCH_CAPABILITY,
  StaticCredentialProvider,
  connectorCapabilities,
} from "@parmana/connector-sdk";
import { createGatewayRazorpayConnector } from "@parmana/execution-gateway";

//
// Every other Razorpay webhook tutorial/test in this suite proves
// acceptance against a SYNTHETIC, self-signed payload this codebase
// constructed itself. This tutorial replays a REAL, Razorpay-initiated
// webhook delivery -- captured live by registering a temporary local
// capture tap as a Test Mode webhook endpoint and triggering a real
// refund through this codebase's own production POST /execute chain.
// PII is redacted, but the real field shape (the payment+refund
// sibling structure under `payload`) is exactly what Razorpay's own
// webhook infrastructure sent. The point isn't "a webhook gets
// accepted" -- it's that the REAL shape satisfies every assumption
// this codebase's parsing/correlation logic makes, not just the
// synthetic shapes this codebase itself constructs in every other test.
//
process.env.NODE_ENV = "test";

const {
  EVENT_ID,
  FIXTURE_SECRET,
  PROVENANCE,
  RAW_BODY,
  RAW_BODY_SIGNATURE,
} = await import("../../../packages/api/tests/fixtures/razorpay-webhook-real-delivery.js");

const { createExecutionSystem } = await import(
  "../../../packages/api/src/bootstrap/createExecutionSystem.js"
);
const { createApplication } = await import(
  "../../../packages/api/src/application.js"
);
const { createApp } = await import("../../../packages/api/src/app.js");
const { InMemoryRazorpayWebhookEventStore } = await import(
  "../../../packages/api/src/webhooks/InMemoryRazorpayWebhookEventStore.js"
);
const { InMemoryRazorpayWebhookAuditSink } = await import(
  "../../../packages/api/src/webhooks/InMemoryRazorpayWebhookAuditSink.js"
);
const { RazorpaySettlementProcessor } = await import(
  "../../../packages/api/src/webhooks/RazorpaySettlementProcessor.js"
);

console.log();
console.log("==================================================");
console.log("Tutorial 85 - Razorpay Real Webhook Fixture");
console.log("==================================================");
console.log();

console.log("Provenance of this fixture");
console.log("--------------------------------------------------");
console.log(`Captured at      : ${PROVENANCE.capturedAt}`);
console.log(`Delivery path    : ${PROVENANCE.deliveryPath}`);
console.log(`Event type       : ${PROVENANCE.eventType}`);
console.log();

console.log("Scenario 1: The real payload, through the actual POST /webhooks/razorpay route");
console.log("--------------------------------------------------");

const executionSystem = createExecutionSystem();
const application = createApplication(executionSystem);
const eventStore = new InMemoryRazorpayWebhookEventStore();
const auditSink = new InMemoryRazorpayWebhookAuditSink();

const app = createApp(application, {
  callerAuth: "disabled",
  razorpayWebhook: { secret: FIXTURE_SECRET, eventStore, auditSink },
});

const server = app.listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;

try {
  const response = await fetch(`${baseUrl}/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Razorpay-Signature": RAW_BODY_SIGNATURE,
      "X-Razorpay-Event-Id": EVENT_ID,
    },
    body: RAW_BODY,
  });
  const body = await response.json();

  console.log(`Status              : ${response.status}`);
  console.log(`Body.status         : ${body.status}`);
  console.log(`Events recorded     : ${eventStore.events.length}`);
  console.log(`Extracted paymentId : ${(auditSink.events.find((e) => e.type === "webhook.received") as { paymentId?: string } | undefined)?.paymentId}`);
  console.log(`Extracted refundId  : ${(auditSink.events.find((e) => e.type === "webhook.received") as { refundId?: string } | undefined)?.refundId}`);
  console.log();

  const scenario1Passed =
    response.status === 200 &&
    body.status === "accepted" &&
    eventStore.events.length === 1 &&
    eventStore.events[0]?.eventId === EVENT_ID;

  console.log("Scenario 2: RazorpaySettlementProcessor correlates and settles the real payload");
  console.log("--------------------------------------------------");

  const KEY_ID = "rzp_test_realfixture00";
  const KEY_SECRET = "real-fixture-test-key-secret";
  const mockServer = new MockRazorpayServer({ keyId: KEY_ID, keySecret: KEY_SECRET });
  await mockServer.listen();

  try {
    mockServer.setPayment({
      id: PROVENANCE.razorpayPaymentId,
      entity: "payment",
      status: "captured",
      amount: 10000,
      currency: "INR",
      amount_refunded: 1800,
      captured: true,
    });

    // The mock server's normal create flow always assigns a random refund
    // id, which cannot reproduce a real, externally-captured one --
    // seedExistingRefund inserts the refund carrying the EXACT id the
    // real captured payload references.
    mockServer.seedExistingRefund(PROVENANCE.razorpayPaymentId, {
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

    const connector = createGatewayRazorpayConnector({
      connectorId: "razorpay",
      capabilities: connectorCapabilities([
        RAZORPAY_PAYMENT_FETCH_CAPABILITY,
        RAZORPAY_REFUND_CREATE_CAPABILITY,
        RAZORPAY_REFUND_FETCH_CAPABILITY,
      ]),
      baseUrl: mockServer.baseUrl,
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
          issuedAt: new Date(),
        },
      ],
      settlementConfirmations: [],
      trustRecordHash: "fixture-trust-record-hash",
      signature: { algorithm: "ed25519", keyId: "default", value: "fixture-signature", signedAt: new Date() },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ExecutionTrustRecord);

    const settlementEventStore = new InMemoryRazorpayWebhookEventStore();
    const settlementAuditSink = new InMemoryRazorpayWebhookAuditSink();
    const processor = new RazorpaySettlementProcessor({
      eventStore: settlementEventStore,
      trustRecords,
      auditSink: settlementAuditSink,
      connector,
      credentialProvider,
    });

    const outcome = await processor.processEvent({
      eventId: EVENT_ID,
      eventType: PROVENANCE.eventType,
      payload: RAW_BODY,
      receivedAt: PROVENANCE.capturedAt,
    });

    const record = await trustRecords.findByTransactionId(businessTransactionId);
    const confirmation = record?.settlementConfirmations?.[0];

    console.log(`Processor outcome     : ${outcome}`);
    console.log(`Confirmation status   : ${confirmation?.status}`);
    console.log(`Fetched refund status : ${confirmation?.fetchedRefundStatus}`);
    console.log(`Correlated refundId   : ${confirmation?.razorpayRefundId}`);
    console.log();

    const scenario2Passed =
      outcome === "confirmed" &&
      confirmation?.status === SettlementStatus.SETTLED &&
      confirmation.fetchedRefundStatus === "processed" &&
      confirmation.razorpayRefundId === PROVENANCE.razorpayRefundId &&
      confirmation.webhookEventId === EVENT_ID;

    if (scenario1Passed && scenario2Passed) {
      console.log(
        "✓ The real Razorpay-delivered payload shape satisfies both the webhook route's and the settlement processor's parsing assumptions.",
      );
    } else {
      console.log("✗ Expected the real payload to be accepted, correlated, and settled correctly.");
    }
  } finally {
    await mockServer.close();
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 86 - Gateway Attestation");
