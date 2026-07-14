import { readFileSync } from "node:fs";
import path from "node:path";

import { AuthorizationSigner } from "@parmana/crypto";
import type { ExecutionRequest } from "@parmana/execution-system";
import type { Policy } from "@parmana/policy";
import type { ExecutableContent } from "@parmana/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MockRazorpayServer,
  RAZORPAY_REFUND_CREATE_CAPABILITY,
  RazorpayCumulativeRefundLedger,
  buildRazorpayRefundHarness,
  type RazorpayPayment,
  type RazorpayRefundHarness,
} from "../../src/index.js";

const KEY_ID = "rzp_test_demopartner00";
const KEY_SECRET = "demo_partner_key_secret_never_leaked";

const policy = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../../../policies/razorpay-refund/1.0.0/policy.json"),
    "utf8",
  ),
) as Policy;

function capturedPayment(overrides: Partial<RazorpayPayment> = {}): RazorpayPayment {
  return {
    id: "pay_ABC123",
    entity: "payment",
    status: "captured",
    amount: 1000000,
    currency: "INR",
    amount_refunded: 0,
    captured: true,
    ...overrides,
  };
}

let server: MockRazorpayServer;
let harness: RazorpayRefundHarness;

beforeEach(async () => {
  server = new MockRazorpayServer({ keyId: KEY_ID, keySecret: KEY_SECRET });
  await server.listen();
  harness = buildRazorpayRefundHarness({ baseUrl: server.baseUrl, keyId: KEY_ID, keySecret: KEY_SECRET, policy });
});

afterEach(async () => {
  await server.close();
});

describe("RazorpayRefundService", () => {
  it("executes a refund when every policy rule passes", async () => {
    server.setPayment(capturedPayment());

    const outcome = await harness.service.requestRefund({
      businessTransactionId: "txn-approve-1",
      paymentId: "pay_ABC123",
      amountPaise: 200000,
      reason: "customer requested",
      scopeId: "session-1",
    });

    expect(outcome.replayed).toBe(false);
    expect(outcome.receipt.approved).toBe(true);
    expect(outcome.receipt.razorpayRefundId).toMatch(/^rfnd_/);
    expect(outcome.receipt.amountPaise).toBe(200000);
    expect(outcome.receipt.paymentId).toBe("pay_ABC123");
    expect(outcome.receipt.policyDecision.outcome).toBe("APPROVE");
    expect(server.refundsFor("pay_ABC123")).toHaveLength(1);
  });

  it("denies when the payment is not captured", async () => {
    server.setPayment(capturedPayment({ status: "authorized", captured: false }));

    const outcome = await harness.service.requestRefund({
      businessTransactionId: "txn-deny-not-captured",
      paymentId: "pay_ABC123",
      amountPaise: 100000,
      reason: "customer requested",
      scopeId: "session-1",
    });

    expect(outcome.receipt.approved).toBe(false);
    expect(outcome.receipt.policyDecision.matchedRuleId).toBe("reject-payment-not-captured");
    expect(server.refundsFor("pay_ABC123")).toHaveLength(0);
  });

  it("denies when the requested amount exceeds the refundable remainder", async () => {
    server.setPayment(capturedPayment({ amount: 100000, amount_refunded: 0 }));

    const outcome = await harness.service.requestRefund({
      businessTransactionId: "txn-deny-remainder",
      paymentId: "pay_ABC123",
      amountPaise: 150000,
      reason: "over-refund attempt",
      scopeId: "session-1",
    });

    expect(outcome.receipt.approved).toBe(false);
    expect(outcome.receipt.policyDecision.matchedRuleId).toBe("reject-exceeds-refundable-remainder");
    expect(server.refundsFor("pay_ABC123")).toHaveLength(0);
  });

  it("denies when the requested amount exceeds the per-refund cap of 500000 paise", async () => {
    server.setPayment(capturedPayment({ amount: 900000, amount_refunded: 0 }));

    const outcome = await harness.service.requestRefund({
      businessTransactionId: "txn-deny-per-refund-cap",
      paymentId: "pay_ABC123",
      amountPaise: 500001,
      reason: "large refund",
      scopeId: "session-1",
    });

    expect(outcome.receipt.approved).toBe(false);
    expect(outcome.receipt.policyDecision.matchedRuleId).toBe("reject-exceeds-per-refund-cap");
    expect(server.refundsFor("pay_ABC123")).toHaveLength(0);
  });

  it("denies the second of two authorized refunds once their combined amount exceeds the daily cumulative cap of 2000000 paise", async () => {
    // The per-refund cap (500000 paise) and daily cumulative cap (2000000
    // paise) mean no single refund attempt can come close to the daily cap
    // on its own. To demonstrate the cap across two authorized refunds
    // without inflating this test with 4+ refund calls just to reach it,
    // the first authorized refund of the day is recorded directly on the
    // ledger (exactly what a prior, already-approved-and-executed
    // requestRefund() call would have done), then a second real refund
    // request is made that individually respects the per-refund cap but
    // pushes the day's cumulative total over 2000000 and is denied.
    const ledger = new RazorpayCumulativeRefundLedger();
    ledger.recordApprovedRefund("session-cumulative", 1700000, "txn-cumulative-earlier-today");
    harness = buildRazorpayRefundHarness({ baseUrl: server.baseUrl, keyId: KEY_ID, keySecret: KEY_SECRET, policy, ledger });

    server.setPayment(capturedPayment({ id: "pay_B", amount: 5000000, amount_refunded: 0 }));

    const outcome = await harness.service.requestRefund({
      businessTransactionId: "txn-cumulative-second",
      paymentId: "pay_B",
      amountPaise: 400000,
      reason: "second refund of the day",
      scopeId: "session-cumulative",
    });

    expect(outcome.receipt.approved).toBe(false);
    expect(outcome.receipt.policyDecision.matchedRuleId).toBe("reject-exceeds-daily-cumulative-cap");
    expect(server.refundsFor("pay_B")).toHaveLength(0);
  });

  it("replays the recorded outcome for a repeated transaction id and never contacts Razorpay a second time", async () => {
    server.setPayment(capturedPayment());

    const input = {
      businessTransactionId: "txn-replay-1",
      paymentId: "pay_ABC123",
      amountPaise: 100000,
      reason: "customer requested",
      scopeId: "session-1",
    };

    const first = await harness.service.requestRefund(input);
    expect(first.replayed).toBe(false);
    expect(server.refundsFor("pay_ABC123")).toHaveLength(1);

    const second = await harness.service.requestRefund(input);

    expect(second.replayed).toBe(true);
    expect(second.receipt).toEqual(first.receipt);
    // No second refund was created on the Razorpay side: the replay never touched the network.
    expect(server.refundsFor("pay_ABC123")).toHaveLength(1);
  });

  it("application-level idempotency: if Razorpay already has a refund tagged with this transaction id, no create call is issued", async () => {
    server.setPayment(capturedPayment());

    // Simulate a refund that already exists on Razorpay's side (e.g. created
    // by a prior process instance whose local outcome cache was lost),
    // tagged with the same parmana transaction id the service will use.
    const preExisting = await directRefundCreateCall(server.baseUrl, "pay_ABC123", "txn-preexisting", 100000);
    expect(preExisting.id).toMatch(/^rfnd_/);
    expect(server.refundsFor("pay_ABC123")).toHaveLength(1);

    const outcome = await harness.service.requestRefund({
      businessTransactionId: "txn-preexisting",
      paymentId: "pay_ABC123",
      amountPaise: 100000,
      reason: "customer requested",
      scopeId: "session-1",
    });

    expect(outcome.receipt.approved).toBe(true);
    expect(outcome.receipt.razorpayIdempotent).toBe(true);
    expect(outcome.receipt.razorpayRefundId).toBe(preExisting.id);
    // Still exactly one refund on Razorpay's side: no duplicate create call.
    expect(server.refundsFor("pay_ABC123")).toHaveLength(1);
  });

  it("never places key_secret in the receipt, and includes only a redacted key_id", async () => {
    server.setPayment(capturedPayment());

    const outcome = await harness.service.requestRefund({
      businessTransactionId: "txn-credential-isolation",
      paymentId: "pay_ABC123",
      amountPaise: 100000,
      reason: "customer requested",
      scopeId: "session-1",
    });

    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain(KEY_SECRET);
    expect(outcome.receipt.keyIdRedacted).toBe("rzp_test...");
  });

  it("never places key_secret in a thrown error when the connector rejects a bad credential", async () => {
    server.setPayment(capturedPayment());
    const badHarness = buildRazorpayRefundHarness({
      baseUrl: server.baseUrl,
      keyId: KEY_ID,
      keySecret: "wrong-secret-value",
      policy,
    });

    let caught: unknown;
    try {
      await badHarness.service.requestRefund({
        businessTransactionId: "txn-bad-credential",
        paymentId: "pay_ABC123",
        amountPaise: 100000,
        reason: "customer requested",
        scopeId: "session-1",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toContain(KEY_SECRET);
    expect((caught as Error).message).not.toContain("wrong-secret-value");
  });

  it("rejects a tampered request: a modified parameter after signing fails the businessTransactionHash check and is never executed", async () => {
    server.setPayment(capturedPayment());

    const executableContent: ExecutableContent = Object.freeze({
      businessTransactionId: "txn-tamper-1",
      action: RAZORPAY_REFUND_CREATE_CAPABILITY,
      target: "payments/pay_ABC123/refund",
      parameters: Object.freeze({ paymentId: "pay_ABC123", amountPaise: 100000, reason: "legitimate" }),
    });

    const authorization = await new AuthorizationSigner(harness.crypto).sign(
      {
        decisionId: "decision-tamper-1",
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

    await expect(harness.gateway.execute(tamperedRequest)).rejects.toThrow(/businessTransactionHashMatches/);
    expect(server.refundsFor("pay_ABC123")).toHaveLength(0);
  });
});

async function directRefundCreateCall(
  baseUrl: string,
  paymentId: string,
  parmanaTxnId: string,
  amountPaise: number,
): Promise<{ id: string }> {
  const response = await fetch(`${baseUrl}/payments/${paymentId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`,
    },
    body: JSON.stringify({ amount: amountPaise, notes: { parmana_txn: parmanaTxnId } }),
  });
  return (await response.json()) as { id: string };
}
