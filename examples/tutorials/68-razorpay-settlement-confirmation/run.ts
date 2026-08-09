import type { ExecutionTrustRecord } from "@parmana/shared";
import { SettlementStatus } from "@parmana/shared";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";
import { CryptoBootstrap, FileKeyProvider, SignatureVerifier } from "@parmana/crypto";
import {
  MockRazorpayServer,
  PARMANA_TXN_NOTES_KEY,
  RAZORPAY_PAYMENT_FETCH_CAPABILITY,
  RAZORPAY_REFUND_CREATE_CAPABILITY,
  RAZORPAY_REFUND_FETCH_CAPABILITY,
  StaticCredentialProvider,
  connectorCapabilities,
  type Connector,
} from "@parmana/connector-sdk";
import { createGatewayRazorpayConnector } from "@parmana/execution-gateway";

import { RazorpaySettlementProcessor } from "../../../packages/api/src/webhooks/RazorpaySettlementProcessor.js";
import { InMemoryRazorpayWebhookEventStore } from "../../../packages/api/src/webhooks/InMemoryRazorpayWebhookEventStore.js";
import { InMemoryRazorpayWebhookAuditSink } from "../../../packages/api/src/webhooks/InMemoryRazorpayWebhookAuditSink.js";
import type { PendingRazorpayWebhookEvent } from "../../../packages/api/src/webhooks/RazorpayWebhookTypes.js";

//
// A settlement webhook is a doorbell, not a delivery: this tutorial
// proves RazorpaySettlementProcessor never signs a SettlementConfirmation
// based on the webhook's own claimed status. It always re-fetches the
// refund from Razorpay first, and the fetched status -- not the
// webhook's eventType -- decides the outcome.
//
const KEY_ID = "rzp_test_tutorial68";
const KEY_SECRET = "tutorial-68-key-secret";

function buildTrustRecord(businessTransactionId: string): ExecutionTrustRecord {
  return {
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
        trustRecordHash: "tutorial-trust-record-hash",
        receiptHash: "tutorial-receipt-hash",
        signature: "tutorial-receipt-signature",
        algorithm: "ed25519",
        issuedAt: new Date(),
      },
    ],
    settlementConfirmations: [],
    trustRecordHash: "tutorial-trust-record-hash",
    signature: { algorithm: "ed25519", keyId: "default", value: "tutorial-signature", signedAt: new Date() },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ExecutionTrustRecord;
}

function refundEvent(overrides: {
  eventId: string;
  businessTransactionId: string;
  razorpayRefundId: string;
  claimedEventType: string;
}): PendingRazorpayWebhookEvent {
  const payload = JSON.stringify({
    entity: "event",
    event: overrides.claimedEventType,
    payload: {
      refund: {
        entity: {
          id: overrides.razorpayRefundId,
          payment_id: "pay_TUT068",
          amount: 100_000,
          status: "processed",
          notes: { [PARMANA_TXN_NOTES_KEY]: overrides.businessTransactionId },
        },
      },
    },
  });

  return {
    eventId: overrides.eventId,
    eventType: overrides.claimedEventType,
    payload,
    receivedAt: new Date().toISOString(),
  };
}

console.log();
console.log("==================================================");
console.log("Tutorial 68 - Razorpay Settlement Confirmation");
console.log("==================================================");
console.log();

const server = new MockRazorpayServer({ keyId: KEY_ID, keySecret: KEY_SECRET });
await server.listen();

try {
  const connector: Connector = createGatewayRazorpayConnector({
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
  const eventStore = new InMemoryRazorpayWebhookEventStore();
  const auditSink = new InMemoryRazorpayWebhookAuditSink();

  const processor = new RazorpaySettlementProcessor({
    eventStore,
    trustRecords,
    auditSink,
    connector,
    credentialProvider,
  });

  async function seedRefund(status: "processed" | "failed"): Promise<string> {
    server.setPayment({
      id: "pay_TUT068",
      entity: "payment",
      status: "captured",
      amount: 1_000_000,
      currency: "INR",
      amount_refunded: 0,
      captured: true,
    });

    const result = await connector.execute(
      {
        capability: RAZORPAY_REFUND_CREATE_CAPABILITY,
        businessTransactionId: "tutorial-68-seed",
        action: RAZORPAY_REFUND_CREATE_CAPABILITY,
        target: "payments/pay_TUT068/refund",
        parameters: { paymentId: "pay_TUT068", amountPaise: 100_000 },
      },
      { credential: await credentialProvider.resolve("razorpay"), timeoutMs: 5000, requestedAt: new Date() },
    );

    const seededId = (result.metadata as { refund?: { id?: string } } | undefined)?.refund?.id as string;
    // Forces what the *fetch* will report, independent of what the
    // webhook itself will separately claim below.
    server.setRefundStatus(seededId, status);
    return seededId;
  }

  console.log("Scenario 1: Genuine settlement (webhook and real state agree)");
  console.log("--------------------------------------------------");

  const txn1 = "tutorial-68-settled";
  await trustRecords.create(buildTrustRecord(txn1));
  const refundId1 = await seedRefund("processed");
  const outcome1 = await processor.processEvent(
    refundEvent({ eventId: "evt-68-1", businessTransactionId: txn1, razorpayRefundId: refundId1, claimedEventType: "refund.processed" }),
  );
  const record1 = await trustRecords.findByTransactionId(txn1);
  const confirmation1 = record1?.settlementConfirmations?.[0];

  console.log(`Processor outcome        : ${outcome1}`);
  console.log(`Confirmation status      : ${confirmation1?.status}`);
  console.log(`Fetched refund status    : ${confirmation1?.fetchedRefundStatus}`);

  // The confirmation is signed -- independently verifiable with
  // nothing but the artifact and the public key, exactly like Tutorial
  // 55's receipt verification.
  const cryptoProvider = CryptoBootstrap.create();
  const verifier = new SignatureVerifier(cryptoProvider);
  const publicKey = await new FileKeyProvider().getPublicKey("default");
  const { signature: sig1, ...unsigned1 } = confirmation1!;
  const signatureValid1 = await verifier.verify(unsigned1, sig1, publicKey);
  console.log(`Signature independently verifiable : ${signatureValid1}`);
  console.log();

  console.log("Scenario 2: Webhook claims success, but the real state disagrees");
  console.log("--------------------------------------------------");

  const txn2 = "tutorial-68-mismatch";
  await trustRecords.create(buildTrustRecord(txn2));
  // The refund's REAL status, as Razorpay itself reports it, is
  // "failed" -- but the webhook delivery claims "refund.processed"
  // anyway (a real-world race: Razorpay's own eventual-consistency
  // window, or simply an untrustworthy/replayed delivery).
  const refundId2 = await seedRefund("failed");
  const outcome2 = await processor.processEvent(
    refundEvent({ eventId: "evt-68-2", businessTransactionId: txn2, razorpayRefundId: refundId2, claimedEventType: "refund.processed" }),
  );
  const record2 = await trustRecords.findByTransactionId(txn2);
  const confirmation2 = record2?.settlementConfirmations?.[0];

  console.log(`Webhook's claimed event  : refund.processed`);
  console.log(`Processor outcome        : ${outcome2}`);
  console.log(`Confirmation status      : ${confirmation2?.status} (expected SETTLEMENT_FAILED -- the fetch, not the webhook, decided this)`);
  console.log(`Fetched refund status    : ${confirmation2?.fetchedRefundStatus}`);
  console.log();

  const allPassed =
    outcome1 === "confirmed" &&
    confirmation1?.status === SettlementStatus.SETTLED &&
    confirmation1?.fetchedRefundStatus === "processed" &&
    signatureValid1 === true &&
    outcome2 === "confirmed" &&
    confirmation2?.status === SettlementStatus.SETTLEMENT_FAILED &&
    confirmation2?.fetchedRefundStatus === "failed";

  if (allPassed) {
    console.log("✓ The fetched real state decided both outcomes -- the webhook's own claim was never trusted.");
  } else {
    console.log("✗ Expected the fetch-verify result, not the webhook's claim, to determine settlement status.");
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 69 - HubSpot Deal Update Connector");
} finally {
  await server.close();
}
