import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ExecutionTrustRecord } from "@parmana/shared";
import { SettlementStatus } from "@parmana/shared";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";
import { SignatureVerifier, CryptoBootstrap } from "@parmana/crypto";
import { FileKeyProvider } from "@parmana/crypto";
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

import { RazorpaySettlementProcessor } from "../../../src/webhooks/RazorpaySettlementProcessor.js";
import { InMemoryRazorpayWebhookEventStore } from "../../../src/webhooks/InMemoryRazorpayWebhookEventStore.js";
import { InMemoryRazorpayWebhookAuditSink } from "../../../src/webhooks/InMemoryRazorpayWebhookAuditSink.js";
import type { PendingRazorpayWebhookEvent } from "../../../src/webhooks/RazorpayWebhookTypes.js";

const KEY_ID = "rzp_test_settlement00";
const KEY_SECRET = "settlement-test-key-secret";

function buildTrustRecord(businessTransactionId: string, withReceipt = true): ExecutionTrustRecord {
  return {
    trustRecordId: `trust-${businessTransactionId}`,
    businessTransactionId,
    transaction: { businessTransactionId },
    overrides: [],
    executions: [],
    verifications: [],
    receipts: withReceipt
      ? [
          {
            receiptId: `receipt-${businessTransactionId}`,
            businessTransactionId,
            trustRecordHash: "unit-test-trust-record-hash",
            receiptHash: "unit-test-receipt-hash",
            signature: "unit-test-receipt-signature",
            algorithm: "ed25519",
            issuedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ]
      : [],
    settlementConfirmations: [],
    trustRecordHash: "unit-test-trust-record-hash",
    signature: { algorithm: "ed25519", keyId: "default", value: "unit-test-signature", signedAt: new Date() },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  } as unknown as ExecutionTrustRecord;
}

function refundProcessedEvent(overrides: {
  eventId: string;
  businessTransactionId: string;
  razorpayRefundId: string;
  eventType?: string;
}): PendingRazorpayWebhookEvent {
  const eventType = overrides.eventType ?? "refund.processed";
  const payload = JSON.stringify({
    entity: "event",
    event: eventType,
    payload: {
      refund: {
        entity: {
          id: overrides.razorpayRefundId,
          payment_id: "pay_unit_test",
          amount: 100,
          status: "processed",
          notes: { [PARMANA_TXN_NOTES_KEY]: overrides.businessTransactionId },
        },
      },
    },
  });

  return {
    eventId: overrides.eventId,
    eventType,
    payload,
    receivedAt: new Date().toISOString(),
  };
}

describe("RazorpaySettlementProcessor", () => {
  let server: MockRazorpayServer;
  let connector: RazorpayConnector;
  let credentialProvider: StaticCredentialProvider;
  let trustRecords: MemoryExecutionTrustRecordRepository;
  let eventStore: InMemoryRazorpayWebhookEventStore;
  let auditSink: InMemoryRazorpayWebhookAuditSink;
  let processor: RazorpaySettlementProcessor;

  beforeEach(async () => {
    server = new MockRazorpayServer({ keyId: KEY_ID, keySecret: KEY_SECRET });
    await server.listen();

    connector = new RazorpayConnector({
      connectorId: "razorpay",
      capabilities: connectorCapabilities([
        RAZORPAY_PAYMENT_FETCH_CAPABILITY,
        RAZORPAY_REFUND_CREATE_CAPABILITY,
        RAZORPAY_REFUND_FETCH_CAPABILITY,
      ]),
      baseUrl: server.baseUrl,
    });

    credentialProvider = new StaticCredentialProvider({ razorpay: { keyId: KEY_ID, keySecret: KEY_SECRET } });
    trustRecords = new MemoryExecutionTrustRecordRepository();
    eventStore = new InMemoryRazorpayWebhookEventStore();
    auditSink = new InMemoryRazorpayWebhookAuditSink();

    processor = new RazorpaySettlementProcessor({
      eventStore,
      trustRecords,
      auditSink,
      connector,
      credentialProvider,
      maxParkAttempts: 3,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  /** Seeds the mock server with a refund whose id matches what refundProcessedEvent() references. */
  async function seedRefund(razorpayRefundId: string, status: "processed" | "failed" = "processed") {
    server.setPayment({
      id: "pay_unit_test",
      entity: "payment",
      status: "captured",
      amount: 10000,
      currency: "INR",
      amount_refunded: 100,
      captured: true,
    });
    // Land a refund via the real create-refund path so it's addressable by id,
    // then force its status to whatever this test needs fetch-verify to see.
    const result = await connector.execute(
      {
        capability: RAZORPAY_REFUND_CREATE_CAPABILITY,
        businessTransactionId: "seed-txn",
        action: RAZORPAY_REFUND_CREATE_CAPABILITY,
        target: "payments/pay_unit_test/refund",
        parameters: { paymentId: "pay_unit_test", amountPaise: 100 },
      },
      { credential: await credentialProvider.resolve("razorpay"), timeoutMs: 5000, requestedAt: new Date() },
    );
    const seededId = (result.metadata as { refund?: { id?: string } } | undefined)?.refund?.id as string;
    server.setRefundStatus(seededId, status);
    return seededId;
  }

  it("processed event -> fetch-verify -> signed confirmation -> trust record settled; signature verifiable", async () => {
    const businessTransactionId = "txn-settled-001";
    await trustRecords.create(buildTrustRecord(businessTransactionId));

    const razorpayRefundId = await seedRefund("unused", "processed");
    const event = refundProcessedEvent({ eventId: "evt-1", businessTransactionId, razorpayRefundId });

    const outcome = await processor.processEvent(event);
    expect(outcome).toBe("confirmed");

    const record = await trustRecords.findByTransactionId(businessTransactionId);
    expect(record?.settlementConfirmations).toHaveLength(1);

    const confirmation = record!.settlementConfirmations![0]!;
    expect(confirmation.status).toBe(SettlementStatus.SETTLED);
    expect(confirmation.fetchedRefundStatus).toBe("processed");
    expect(confirmation.webhookEventId).toBe("evt-1");
    expect(confirmation.receiptId).toBe(`receipt-${businessTransactionId}`);

    // Signature verifiable via the existing verifier (same technique as
    // receipt-signature.integration.test.ts).
    const cryptoProvider = CryptoBootstrap.create();
    const verifier = new SignatureVerifier(cryptoProvider);
    const keyProvider = new FileKeyProvider();
    const publicKey = await keyProvider.getPublicKey("default");
    const { signature, ...unsigned } = confirmation;
    expect(await verifier.verify(unsigned, signature, publicKey)).toBe(true);

    const confirmedAudit = auditSink.events.find((e) => e.type === "settlement.confirmed");
    expect(confirmedAudit).toBeDefined();
    expect(confirmedAudit?.eventId).toBe("evt-1");
  });

  it("failed event -> settlement-failed + flagged audit", async () => {
    const businessTransactionId = "txn-failed-001";
    await trustRecords.create(buildTrustRecord(businessTransactionId));

    const razorpayRefundId = await seedRefund("unused", "failed");
    const event = refundProcessedEvent({
      eventId: "evt-2",
      businessTransactionId,
      razorpayRefundId,
      eventType: "refund.failed",
    });

    const outcome = await processor.processEvent(event);
    expect(outcome).toBe("confirmed");

    const record = await trustRecords.findByTransactionId(businessTransactionId);
    const confirmation = record!.settlementConfirmations![0]!;
    expect(confirmation.status).toBe(SettlementStatus.SETTLEMENT_FAILED);
    expect(confirmation.fetchedRefundStatus).toBe("failed");

    const failedAudit = auditSink.events.find((e) => e.type === "settlement.failed");
    expect(failedAudit).toBeDefined();
    expect(failedAudit?.severity).toBe("flagged");
  });

  it("webhook claims processed but fetch says failed -> fetched state wins", async () => {
    const businessTransactionId = "txn-mismatch-001";
    await trustRecords.create(buildTrustRecord(businessTransactionId));

    // Webhook event TYPE says "refund.processed" (the caller's claim),
    // but the mock server's fetch response for this refund id is
    // forced to "failed" — the fetched state must win.
    const razorpayRefundId = await seedRefund("unused", "failed");
    const event = refundProcessedEvent({
      eventId: "evt-3",
      businessTransactionId,
      razorpayRefundId,
      eventType: "refund.processed",
    });

    await processor.processEvent(event);

    const record = await trustRecords.findByTransactionId(businessTransactionId);
    const confirmation = record!.settlementConfirmations![0]!;
    expect(confirmation.status).toBe(SettlementStatus.SETTLEMENT_FAILED);
    expect(confirmation.fetchedRefundStatus).toBe("failed");
  });

  it("parks when the trust record does not exist yet, then resolves once it appears", async () => {
    const businessTransactionId = "txn-race-001";
    const razorpayRefundId = await seedRefund("unused", "processed");
    const event = refundProcessedEvent({ eventId: "evt-4", businessTransactionId, razorpayRefundId });

    // First attempt: trust record does not exist yet.
    const firstOutcome = await processor.processEvent(event);
    expect(firstOutcome).toBe("parked");
    expect(auditSink.events.some((e) => e.type === "settlement.parked")).toBe(true);

    // Trust record appears (the synchronous execution path finishes).
    await trustRecords.create(buildTrustRecord(businessTransactionId));

    const secondOutcome = await processor.processEvent(event);
    expect(secondOutcome).toBe("confirmed");

    const record = await trustRecords.findByTransactionId(businessTransactionId);
    expect(record?.settlementConfirmations).toHaveLength(1);
  });

  it("gives up after the park window is exhausted: flagged audit, event never reprocessed, no crash", async () => {
    const businessTransactionId = "txn-race-never-appears";
    const razorpayRefundId = await seedRefund("unused", "processed");
    const event = refundProcessedEvent({ eventId: "evt-5", businessTransactionId, razorpayRefundId });

    // maxParkAttempts is 3 for this processor instance.
    expect(await processor.processEvent(event)).toBe("parked");
    expect(await processor.processEvent(event)).toBe("parked");
    expect(await processor.processEvent(event)).toBe("parked");
    expect(await processor.processEvent(event)).toBe("failed");

    const exhaustedAudit = auditSink.events.find((e) => e.type === "settlement.park_exhausted");
    expect(exhaustedAudit).toBeDefined();
    expect(exhaustedAudit?.severity).toBe("flagged");

    // Event stays consumed (no infinite reprocessing): a further call
    // returns "already-resolved", not another park/failure.
    expect(await processor.processEvent(event)).toBe("already-resolved");

    // Never crashed even though the trust record never appeared.
    expect(await trustRecords.findByTransactionId(businessTransactionId)).toBeNull();
  });

  it("fetch-verify unreachable -> no confirmation written, flagged audit after window exhaustion, no crash", async () => {
    const businessTransactionId = "txn-unreachable-001";
    await trustRecords.create(buildTrustRecord(businessTransactionId));

    // Close the mock server so every fetch-verify call fails.
    await server.close();

    const event = refundProcessedEvent({
      eventId: "evt-6",
      businessTransactionId,
      razorpayRefundId: "rfnd_unreachable",
    });

    expect(await processor.processEvent(event)).toBe("parked");
    expect(await processor.processEvent(event)).toBe("parked");
    expect(await processor.processEvent(event)).toBe("parked");
    expect(await processor.processEvent(event)).toBe("failed");

    const record = await trustRecords.findByTransactionId(businessTransactionId);
    expect(record?.settlementConfirmations ?? []).toHaveLength(0);

    const exhaustedAudit = auditSink.events.find((e) => e.type === "settlement.park_exhausted");
    expect(exhaustedAudit?.severity).toBe("flagged");

    // Recreate a server so afterEach's close() doesn't double-close.
    server = new MockRazorpayServer({ keyId: KEY_ID, keySecret: KEY_SECRET });
    await server.listen();
  });

  it("receipt immutability: the original receipt is byte-identical after a settlement is recorded", async () => {
    const businessTransactionId = "txn-immutable-001";
    await trustRecords.create(buildTrustRecord(businessTransactionId));

    const before = await trustRecords.findByTransactionId(businessTransactionId);
    const originalReceipt = before!.receipts[0];

    const razorpayRefundId = await seedRefund("unused", "processed");
    const event = refundProcessedEvent({ eventId: "evt-7", businessTransactionId, razorpayRefundId });
    await processor.processEvent(event);

    const after = await trustRecords.findByTransactionId(businessTransactionId);
    expect(after!.receipts).toHaveLength(1);
    expect(after!.receipts[0]).toEqual(originalReceipt);
    expect(after!.trustRecordHash).toBe(before!.trustRecordHash);
    expect(after!.signature).toEqual(before!.signature);
  });

  it("an irrelevant event type is acknowledged as ignored, audited, and never treated as an error", async () => {
    const businessTransactionId = "txn-ignored-001";
    await trustRecords.create(buildTrustRecord(businessTransactionId));

    const event = refundProcessedEvent({
      eventId: "evt-8",
      businessTransactionId,
      razorpayRefundId: "rfnd_irrelevant",
      eventType: "payment.captured",
    });

    const outcome = await processor.processEvent(event);
    expect(outcome).toBe("ignored");

    const record = await trustRecords.findByTransactionId(businessTransactionId);
    expect(record?.settlementConfirmations ?? []).toHaveLength(0);

    const ignoredAudit = auditSink.events.find((e) => e.eventId === "evt-8");
    expect(ignoredAudit).toBeDefined();
    expect(ignoredAudit?.reason).toContain("not an error");
  });

  it("runOnce drains multiple stored events and summarizes outcomes", async () => {
    const settledTxn = "txn-run-once-settled";
    await trustRecords.create(buildTrustRecord(settledTxn));
    const refundId = await seedRefund("unused", "processed");

    const parkedTxn = "txn-run-once-parked";

    await eventStore.recordIfUnseen(refundProcessedEvent({ eventId: "run-1", businessTransactionId: settledTxn, razorpayRefundId: refundId }));
    await eventStore.recordIfUnseen(refundProcessedEvent({ eventId: "run-2", businessTransactionId: parkedTxn, razorpayRefundId: "rfnd_never" }));
    await eventStore.recordIfUnseen(
      refundProcessedEvent({ eventId: "run-3", businessTransactionId: settledTxn, razorpayRefundId: refundId, eventType: "payment.captured" }),
    );

    const summary = await processor.runOnce();
    expect(summary.confirmed).toBe(1);
    expect(summary.parked).toBe(1);
    expect(summary.ignored).toBe(1);
    expect(summary.failed).toBe(0);
  });
});
