import crypto from "node:crypto";

import type { BusinessTransaction } from "@parmana/shared";
import {
  MockRazorpayServer,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_SECRET,
} from "@parmana/connector-sdk";

//
// TD-23 closure (Phase 3B): a caller could declare any
// dailyCumulativeAfterThisRefundPaise value it likes -- nothing about
// the transaction schema stops it from understating today's running
// total to stay "within cap" on paper. RazorpayDailyRefundLedger's
// atomic reserve() closes that gap by deriving the real total itself,
// and its single-process atomicity (see
// InMemoryRazorpayDailyRefundLedger.ts) means concurrent requests are
// serialized correctly rather than racing on a stale read.
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

const DAILY_CUMULATIVE_CAP_PAISE = 2_000_000;
const PAYMENT_AMOUNT_PAISE = 5_000_000;

function refundTransaction(overrides: {
  paymentId: string;
  amountPaise: number;
  refundableRemainingPaise: number;
  dailyCumulativeAfterThisRefundPaise: number;
  createdBy: string;
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
      createdBy: overrides.createdBy,
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: overrides.createdBy,
      displayName: overrides.createdBy,
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
    // requestedExceedsRemainder is always false here: every payment in
    // this tutorial starts at 5,000,000 paise, far more than it ever
    // refunds, so only the daily cumulative cap is ever the limiting
    // factor -- not the per-refund remainder check Tutorial 64 covers.
    signals: {
      paymentStatus: "captured",
      paymentCurrency: "INR",
      refundableRemainingPaise: overrides.refundableRemainingPaise,
      requestedRefundAmountPaise: overrides.amountPaise,
      requestedExceedsRemainder: false,
      dailyCumulativeAfterThisRefundPaise: overrides.dailyCumulativeAfterThisRefundPaise,
    },
    status: "RECEIVED",
    createdAt: now,
  } as unknown as BusinessTransaction;
}

async function submitRefund(
  application: ReturnType<typeof createApplication>,
  overrides: {
    paymentId: string;
    amountPaise: number;
    refundableRemainingPaise: number;
    dailyCumulativeAfterThisRefundPaise: number;
    createdBy: string;
  },
): Promise<{ outcome: "APPROVED" | "REJECTED"; reason: string }> {
  const transaction = refundTransaction(overrides);

  try {
    const trustRecord = await application.execute(transaction);
    const decision = trustRecord.executions.at(-1)?.decision;
    return {
      outcome: (decision?.outcome as "APPROVED" | "REJECTED") ?? "REJECTED",
      reason: decision?.reason ?? "",
    };
  } catch (error) {
    return {
      outcome: "REJECTED",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

console.log();
console.log("==================================================");
console.log("Tutorial 66 - Razorpay Daily Cumulative Cap");
console.log("==================================================");
console.log();

try {
  // Phase 1's payment: sequential refunds against a single payment, so
  // its remaining-balance signal is deterministic at every step.
  mockServer.setPayment({
    id: "pay_TUT066_sequential",
    entity: "payment",
    status: "captured",
    amount: PAYMENT_AMOUNT_PAISE,
    currency: "INR",
    amount_refunded: 0,
    captured: true,
  });

  // Phase 2's two payments: separate from each other so that neither
  // concurrent request's independently-verified refundableRemainingPaise
  // depends on which of the two connector calls happens to land first
  // -- only the *shared, per-day* cumulative ledger is contended here,
  // which is exactly the property this tutorial demonstrates.
  mockServer.setPayment({
    id: "pay_TUT066_race_a",
    entity: "payment",
    status: "captured",
    amount: PAYMENT_AMOUNT_PAISE,
    currency: "INR",
    amount_refunded: 0,
    captured: true,
  });
  mockServer.setPayment({
    id: "pay_TUT066_race_b",
    entity: "payment",
    status: "captured",
    amount: PAYMENT_AMOUNT_PAISE,
    currency: "INR",
    amount_refunded: 0,
    captured: true,
  });

  const executionSystem = createExecutionSystem();
  const application = createApplication(executionSystem);

  //
  // Phase 1: four sequential, individually-within-cap refunds, each
  // correctly declaring the real running total. Builds today's
  // cumulative to 1,900,000 paise -- 100,000 paise of headroom left
  // under the 2,000,000 cap.
  //
  console.log("Phase 1: Sequential refunds building up today's cumulative total");
  console.log("--------------------------------------------------");

  let runningTotal = 0;
  for (const amountPaise of [500_000, 500_000, 500_000, 400_000]) {
    const refundableRemainingPaise = PAYMENT_AMOUNT_PAISE - runningTotal;
    runningTotal += amountPaise;
    const result = await submitRefund(application, {
      paymentId: "pay_TUT066_sequential",
      amountPaise,
      refundableRemainingPaise,
      dailyCumulativeAfterThisRefundPaise: runningTotal,
      createdBy: "tutorial-66-sequential",
    });
    console.log(`Refund ${amountPaise} paise -> ${result.outcome} (running total: ${runningTotal})`);
  }
  console.log();

  //
  // Phase 2: two concurrent refund requests of 100,000 paise each,
  // against two different payments, both optimistically declaring
  // 2,000,000 as today's resulting cumulative total -- each assumes it
  // is the only refund landing next. Only one of them actually can be:
  // the ledger's reserve() serializes the two calls on the shared
  // per-day total, so exactly one lands on 2,000,000 (within cap,
  // matches its declaration) and the other lands on 2,100,000 (over
  // cap, and no longer matches what it declared).
  //
  console.log("Phase 2: Two concurrent refund requests for the remaining headroom");
  console.log("--------------------------------------------------");

  const [requestA, requestB] = await Promise.all([
    submitRefund(application, {
      paymentId: "pay_TUT066_race_a",
      amountPaise: 100_000,
      refundableRemainingPaise: PAYMENT_AMOUNT_PAISE,
      dailyCumulativeAfterThisRefundPaise: 2_000_000,
      createdBy: "tutorial-66-race-a",
    }),
    submitRefund(application, {
      paymentId: "pay_TUT066_race_b",
      amountPaise: 100_000,
      refundableRemainingPaise: PAYMENT_AMOUNT_PAISE,
      dailyCumulativeAfterThisRefundPaise: 2_000_000,
      createdBy: "tutorial-66-race-b",
    }),
  ]);

  console.log(`Request A -> ${requestA.outcome}`);
  console.log(`  ${requestA.reason}`);
  console.log(`Request B -> ${requestB.outcome}`);
  console.log(`  ${requestB.reason}`);
  console.log();

  const outcomes = [requestA.outcome, requestB.outcome];
  const approvedCount = outcomes.filter((o) => o === "APPROVED").length;
  const rejectedCount = outcomes.filter((o) => o === "REJECTED").length;
  const totalRefunds =
    mockServer.refundsFor("pay_TUT066_sequential").length +
    mockServer.refundsFor("pay_TUT066_race_a").length +
    mockServer.refundsFor("pay_TUT066_race_b").length;

  console.log("Razorpay Mock Server State");
  console.log("--------------------------------------------------");
  console.log(`Total refunds recorded : ${totalRefunds} (expected 5: 4 sequential + 1 race winner)`);
  console.log(`Daily cumulative cap    : ${DAILY_CUMULATIVE_CAP_PAISE} paise`);
  console.log();

  if (approvedCount === 1 && rejectedCount === 1 && totalRefunds === 5) {
    console.log(
      "✓ Exactly one of the two concurrent requests was approved; the atomic ledger serialized the race correctly.",
    );
  } else {
    console.log("✗ Expected exactly one approval and one rejection out of the two concurrent requests.");
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 67 - Razorpay Webhook Receipt");
} finally {
  await mockServer.close();
}
