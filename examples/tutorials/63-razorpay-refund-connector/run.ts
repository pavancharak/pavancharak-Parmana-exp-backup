import crypto from "node:crypto";

import type { BusinessTransaction } from "@parmana/shared";
import {
  MockRazorpayServer,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_SECRET,
} from "@parmana/connector-sdk";

//
// This tutorial demonstrates the real Razorpay refund connector,
// reachable through the exact same production bootstrap chain
// server.ts calls (createExecutionSystem -> createApplication),
// pointed at a hermetic MockRazorpayServer via the RAZORPAY_BASE_URL
// test seam instead of Razorpay's real API. Mirrors
// packages/api/tests/integration/razorpay-refund.integration.test.ts's
// approved case.
//
// NODE_ENV=test makes createRazorpayCredentialProvider.ts use the
// built-in placeholder credential automatically -- no real Razorpay
// account or API key involved anywhere in this tutorial.
//
process.env.NODE_ENV = "test";

const KEY_ID = RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID;
const KEY_SECRET = RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_SECRET;

const mockServer = new MockRazorpayServer({
  keyId: KEY_ID,
  keySecret: KEY_SECRET,
});

await mockServer.listen();

process.env.RAZORPAY_BASE_URL = mockServer.baseUrl;

//
// .env sets RAZORPAY_TEST_KEY_ID/SECRET to empty strings (documented
// placeholders for the live-credential test suite), not leaves them
// unset. createRazorpayCredentialProvider.ts's `?? RAZORPAY_TEST_MODE_
// PLACEHOLDER_...` fallback only triggers on undefined, not "", so
// without this override the connector would authenticate with an
// empty-string credential and this mock server -- constructed with
// the real placeholder -- would reject every request with 401.
//
process.env.RAZORPAY_TEST_KEY_ID = KEY_ID;
process.env.RAZORPAY_TEST_KEY_SECRET = KEY_SECRET;

//
// Imported after RAZORPAY_BASE_URL is set: createExecutionSystem's own
// import graph reads process.env at bootstrap-function call time, not
// at module load time, but importing after keeps the ordering
// unambiguous for a reader following this script top to bottom.
//
const { createExecutionSystem } = await import(
  "../../../packages/api/src/bootstrap/createExecutionSystem.js"
);
const { createApplication } = await import(
  "../../../packages/api/src/application.js"
);

function refundTransaction(overrides: {
  paymentId: string;
  amountPaise: number;
  signals: Record<string, unknown>;
}): BusinessTransaction {
  const businessTransactionId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const now = new Date();

  return {
    businessTransactionId,
    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "tutorial-63",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-63",
      displayName: "Tutorial 63",
      issuedAt: now,
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "Tutorial",
      authorizedAt: now,
    },
    intent: {
      intentId,
      authorizationId,
      action: "razorpay:refund-create",
      target: `razorpay://payments/${overrides.paymentId}/refund`,
      parameters: Object.freeze({
        paymentId: overrides.paymentId,
        amountPaise: overrides.amountPaise,
        reason: "customer requested refund",
      }),
      createdAt: now,
    },
    policy: {
      name: "razorpay-refund",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },
    signals: overrides.signals,
    status: "RECEIVED",
    createdAt: now,
  } as unknown as BusinessTransaction;
}

console.log();
console.log("==================================================");
console.log("Tutorial 63 - Razorpay Refund Connector");
console.log("==================================================");
console.log();

try {
  mockServer.setPayment({
    id: "pay_TUT063",
    entity: "payment",
    status: "captured",
    amount: 1_000_000,
    currency: "INR",
    amount_refunded: 0,
    captured: true,
  });

  const executionSystem = createExecutionSystem();
  const application = createApplication(executionSystem);

  const transaction = refundTransaction({
    paymentId: "pay_TUT063",
    amountPaise: 250_000,
    signals: {
      paymentStatus: "captured",
      paymentCurrency: "INR",
      refundableRemainingPaise: 1_000_000,
      requestedRefundAmountPaise: 250_000,
      requestedExceedsRemainder: false,
      dailyCumulativeAfterThisRefundPaise: 250_000,
    },
  });

  const trustRecord = await application.execute(transaction);

  const decision = trustRecord.executions.at(-1)?.decision;

  console.log("Decision");
  console.log("--------------------------------------------------");
  console.log(`Outcome : ${decision?.outcome}`);
  console.log(`Reason  : ${decision?.reason}`);
  console.log();

  // The strongest proof this went through the real connector end to
  // end: a refund actually landed on the (mock) Razorpay server, not
  // just that execution reported success.
  const refunds = mockServer.refundsFor("pay_TUT063");

  console.log("Razorpay Mock Server State");
  console.log("--------------------------------------------------");
  console.log(`Refunds for pay_TUT063 : ${refunds.length}`);
  if (refunds[0]) {
    console.log(`Amount                 : ${refunds[0].amount} paise`);
    console.log(`parmana_txn note       : ${refunds[0].notes?.parmana_txn}`);
  }
  console.log();

  if (
    decision?.outcome === "APPROVED" &&
    refunds.length === 1 &&
    refunds[0]?.amount === 250_000 &&
    refunds[0]?.notes?.parmana_txn === transaction.businessTransactionId
  ) {
    console.log("✓ Refund authorized and executed against the real connector.");
  } else {
    console.log("✗ Expected an approved decision with exactly one matching refund.");
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 64 - Razorpay Policy Denial");
} finally {
  await mockServer.close();
}
