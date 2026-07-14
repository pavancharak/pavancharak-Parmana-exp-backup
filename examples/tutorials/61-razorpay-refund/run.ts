import { AuthorizationSigner } from "@parmana/crypto";

import {
  MockRazorpayServer,
  RAZORPAY_REFUND_CREATE_CAPABILITY,
  buildRazorpayRefundHarness,
  type RazorpayPayment,
} from "@parmana/connector-sdk";

import { FilePolicyRepository } from "@parmana/policy";

import type { ExecutionRequest } from "@parmana/execution-system";
import type { ExecutableContent } from "@parmana/shared";

const KEY_ID = "rzp_test_demopartner00";
const KEY_SECRET = "demo_partner_key_secret_never_leaked";

function capturedPayment(overrides: Partial<RazorpayPayment> = {}): RazorpayPayment {
  return {
    id: "pay_DEMO001",
    entity: "payment",
    status: "captured",
    amount: 1000000,
    currency: "INR",
    amount_refunded: 0,
    captured: true,
    ...overrides,
  };
}

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 61 - Razorpay Refund Connector");
  console.log("==================================================");
  console.log();

  //
  // Local mock Razorpay server. Fake test-mode credentials, never
  // real ones. All Razorpay interaction here is against this
  // in-memory server, never a live network call.
  //
  const server = new MockRazorpayServer({ keyId: KEY_ID, keySecret: KEY_SECRET });
  await server.listen();

  const policy = await new FilePolicyRepository("policies").load("razorpay-refund", "1.0.0");

  const harness = buildRazorpayRefundHarness({
    baseUrl: server.baseUrl,
    keyId: KEY_ID,
    keySecret: KEY_SECRET,
    policy,
  });

  try {
    //
    // Outcome 1 - Approved and Executed
    //
    console.log("Outcome 1 - Approved and Executed");
    console.log("--------------------------------------------------");

    server.setPayment(capturedPayment({ id: "pay_DEMO001" }));

    const approved = await harness.service.requestRefund({
      businessTransactionId: "txn-demo-approved",
      paymentId: "pay_DEMO001",
      amountPaise: 250000,
      reason: "customer requested refund",
      scopeId: "demo-session",
    });

    console.log(`Approved         : ${approved.receipt.approved}`);
    console.log(`Razorpay Refund  : ${approved.receipt.razorpayRefundId}`);
    console.log(`Amount (paise)   : ${approved.receipt.amountPaise}`);
    console.log(`Policy Reason    : ${approved.receipt.policyDecision.reason}`);
    console.log(`Key ID (redacted): ${approved.receipt.keyIdRedacted}`);
    console.log();

    //
    // Outcome 2 - Denied by Policy
    //
    console.log("Outcome 2 - Denied by Policy");
    console.log("--------------------------------------------------");

    server.setPayment(capturedPayment({ id: "pay_DEMO002", status: "authorized", captured: false }));

    const denied = await harness.service.requestRefund({
      businessTransactionId: "txn-demo-denied",
      paymentId: "pay_DEMO002",
      amountPaise: 100000,
      reason: "customer requested refund",
      scopeId: "demo-session",
    });

    console.log(`Approved      : ${denied.receipt.approved}`);
    console.log(`Matched Rule  : ${denied.receipt.policyDecision.matchedRuleId}`);
    console.log(`Reason        : ${denied.receipt.policyDecision.reason}`);
    console.log();

    //
    // Outcome 3 - Replay Returns Recorded Result
    //
    console.log("Outcome 3 - Replay Returns Recorded Result");
    console.log("--------------------------------------------------");

    const refundCountBeforeReplay = server.refundsFor("pay_DEMO001").length;

    const replayed = await harness.service.requestRefund({
      businessTransactionId: "txn-demo-approved",
      paymentId: "pay_DEMO001",
      amountPaise: 250000,
      reason: "customer requested refund",
      scopeId: "demo-session",
    });

    console.log(`Replayed              : ${replayed.replayed}`);
    console.log(`Same Refund Returned  : ${replayed.receipt.razorpayRefundId === approved.receipt.razorpayRefundId}`);
    console.log(
      `Refunds On Razorpay   : ${server.refundsFor("pay_DEMO001").length} (unchanged from ${refundCountBeforeReplay})`,
    );
    console.log();

    //
    // Outcome 4 - Tamper Rejected
    //
    console.log("Outcome 4 - Tamper Rejected");
    console.log("--------------------------------------------------");

    const executableContent: ExecutableContent = Object.freeze({
      businessTransactionId: "txn-demo-tamper",
      action: RAZORPAY_REFUND_CREATE_CAPABILITY,
      target: "payments/pay_DEMO001/refund",
      parameters: Object.freeze({ paymentId: "pay_DEMO001", amountPaise: 100000, reason: "legitimate" }),
    });

    const authorization = await new AuthorizationSigner(harness.crypto).sign(
      {
        decisionId: "decision-demo-tamper",
        businessTransactionId: executableContent.businessTransactionId,
        policyName: harness.policy.policyId,
        policyVersion: harness.policy.policyVersion,
        executableContent,
      },
      harness.signerPrivateKey,
      harness.signerKeyId,
      60,
    );

    const tamperedRequest: ExecutionRequest = {
      businessTransactionId: executableContent.businessTransactionId,
      action: executableContent.action,
      target: executableContent.target,
      // Tampered after signing: amount raised from 100000 to 9900000.
      parameters: { ...executableContent.parameters, amountPaise: 9900000 },
      authorization,
    };

    try {
      await harness.gateway.execute(tamperedRequest);
      console.log("Unexpected: tampered request was accepted.");
    } catch (error) {
      console.log(`Rejected      : true`);
      console.log(`Reason        : ${(error as Error).message}`);
    }
    console.log();

    console.log("==================================================");
    console.log("Tutorial completed successfully.");
    console.log("==================================================");
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
