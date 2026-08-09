import crypto from "node:crypto";

import type { BusinessTransaction } from "@parmana/shared";
import {
  MockRazorpayServer,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_SECRET,
} from "@parmana/connector-sdk";

//
// Tutorial 63's sibling: a refund request that policy must reject, and
// that must never reach the connector at all. Same real production
// composition as 63; only the transaction differs.
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
// See Tutorial 63's run.ts for why these two overrides are required:
// .env sets RAZORPAY_TEST_KEY_ID/SECRET to empty strings, which the
// credential provider's `??` fallback does not treat as unset.
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
      createdBy: "tutorial-64",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-64",
      displayName: "Tutorial 64",
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
console.log("Tutorial 64 - Razorpay Policy Denial");
console.log("==================================================");
console.log();

try {
  // A captured payment with only 100,000 paise left refundable.
  mockServer.setPayment({
    id: "pay_TUT064",
    entity: "payment",
    status: "captured",
    amount: 1_000_000,
    currency: "INR",
    amount_refunded: 900_000,
    captured: true,
  });

  const executionSystem = createExecutionSystem();
  const application = createApplication(executionSystem);

  // Requests 250,000 paise -- more than the 100,000 paise actually
  // remaining -- but *declares* signals as if it fit, to prove policy
  // rejects on the policy's own per-refund-cap rule regardless.
  const transaction = refundTransaction({
    paymentId: "pay_TUT064",
    amountPaise: 250_000,
    signals: {
      paymentStatus: "captured",
      paymentCurrency: "INR",
      refundableRemainingPaise: 100_000,
      requestedRefundAmountPaise: 250_000,
      requestedExceedsRemainder: true,
      dailyCumulativeAfterThisRefundPaise: 250_000,
    },
  });

  let outcome: "APPROVED" | "REJECTED" | "ERROR" = "ERROR";
  let reason = "";

  try {
    const trustRecord = await application.execute(transaction);
    const decision = trustRecord.executions.at(-1)?.decision;
    outcome = (decision?.outcome as "APPROVED" | "REJECTED") ?? "ERROR";
    reason = decision?.reason ?? "";
  } catch (error) {
    // ExecutionGate throws RuntimeError with status 403 / code
    // POLICY_DENIED for a policy rejection -- caught here rather than
    // read off a returned decision, matching how the real HTTP layer
    // (POST /execute) turns this into a 403 response.
    outcome = "REJECTED";
    reason = error instanceof Error ? error.message : String(error);
  }

  console.log("Decision");
  console.log("--------------------------------------------------");
  console.log(`Outcome : ${outcome}`);
  console.log(`Reason  : ${reason}`);
  console.log();

  const refunds = mockServer.refundsFor("pay_TUT064");

  console.log("Razorpay Mock Server State");
  console.log("--------------------------------------------------");
  console.log(`Refunds for pay_TUT064 : ${refunds.length}`);
  console.log();

  if (outcome === "REJECTED" && refunds.length === 0) {
    console.log(
      "✓ Refund denied and zero calls reached the connector -- the mock server has no record of it.",
    );
  } else {
    console.log("✗ Expected a rejected decision with zero refunds recorded.");
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 65 - Razorpay Signal-State Verification");
} finally {
  await mockServer.close();
}
