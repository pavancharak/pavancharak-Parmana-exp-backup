import crypto from "node:crypto";

import type { BusinessTransaction } from "@parmana/shared";
import {
  MockRazorpayServer,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_SECRET,
} from "@parmana/connector-sdk";

//
// G-24 residual closure (RFC-0022): a caller can declare any signals it
// likes on a BusinessTransaction -- nothing stops it from claiming a
// payment is "captured" when it is really only "authorized". This
// tutorial proves RazorpaySignalStateVerifier catches that lie by
// independently fetching the real payment from Razorpay itself before
// policy ever sees the caller's claim.
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
process.env.RAZORPAY_TEST_KEY_ID = KEY_ID;
process.env.RAZORPAY_TEST_KEY_SECRET = KEY_SECRET;

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
      createdBy: "tutorial-65",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-65",
      displayName: "Tutorial 65",
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
console.log("Tutorial 65 - Razorpay Signal-State Verification");
console.log("==================================================");
console.log();

try {
  // The real payment on (mock) Razorpay is only "authorized" -- not
  // yet captured, so Razorpay would refuse to refund it at all.
  mockServer.setPayment({
    id: "pay_TUT065",
    entity: "payment",
    status: "authorized",
    amount: 1_000_000,
    currency: "INR",
    amount_refunded: 0,
    captured: false,
  });

  const executionSystem = createExecutionSystem();
  const application = createApplication(executionSystem);

  // The caller declares signals as if the payment were already
  // captured -- either a stale client-side cache or an outright lie.
  const transaction = refundTransaction({
    paymentId: "pay_TUT065",
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

  let outcome: "APPROVED" | "REJECTED" = "APPROVED";
  let reason = "";

  try {
    const trustRecord = await application.execute(transaction);
    const decision = trustRecord.executions.at(-1)?.decision;
    outcome = (decision?.outcome as "APPROVED" | "REJECTED") ?? "REJECTED";
    reason = decision?.reason ?? "";
  } catch (error) {
    outcome = "REJECTED";
    reason = error instanceof Error ? error.message : String(error);
  }

  console.log("Decision");
  console.log("--------------------------------------------------");
  console.log(`Outcome : ${outcome}`);
  console.log(`Reason  : ${reason}`);
  console.log();

  const refunds = mockServer.refundsFor("pay_TUT065");

  console.log("Razorpay Mock Server State");
  console.log("--------------------------------------------------");
  console.log(`Real payment status (independently fetched) : authorized`);
  console.log(`Caller-declared payment status               : captured`);
  console.log(`Refunds for pay_TUT065                        : ${refunds.length}`);
  console.log();

  if (
    outcome === "REJECTED" &&
    reason.includes("paymentStatus") &&
    refunds.length === 0
  ) {
    console.log(
      "✓ The caller's declared paymentStatus was rejected against the independently verified real state.",
    );
  } else {
    console.log("✗ Expected a rejection naming the paymentStatus mismatch.");
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 66 - Razorpay Daily Cumulative Cap");
} finally {
  await mockServer.close();
}
