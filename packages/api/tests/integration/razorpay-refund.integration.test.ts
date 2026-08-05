import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import type { BusinessTransaction } from "@parmana/shared";
import {
  MockRazorpayServer,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_SECRET,
} from "@parmana/connector-sdk";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";

/**
 * HTTP-level proof that the Razorpay refund connector is reachable
 * through the real, production-wired API — not only through unit tests
 * (packages/connector-sdk/tests/unit/razorpay-*.test.ts) and the
 * standalone tutorial (examples/tutorials/61-razorpay-refund).
 *
 * Uses the same real production bootstrap chain server.ts calls
 * (createExecutionSystem -> createExecutionGateway ->
 * createExecutionControl -> createConnectorRegistry), pointed at a
 * hermetic MockRazorpayServer via the RAZORPAY_BASE_URL test seam
 * (see createRazorpayConnector.ts) instead of a hand-rolled
 * recomposition, so this proves the actual production wiring — not a
 * look-alike of it.
 *
 * Policy evaluation here happens against caller-supplied signals, the
 * same generic mechanism the existing vendor-payment/payments:execute
 * capability already goes through (see business-transaction.ts fixture
 * and caller-auth.integration.test.ts's "composition with policy
 * evaluation" test) — not RazorpayRefundService's separate,
 * stronger-guarantee, fetch-payment-before-evaluating flow, which remains
 * test/tutorial-only and unchanged.
 */
describe("Razorpay refund (HTTP boundary)", () => {
  let server: MockRazorpayServer | undefined;
  const originalRazorpayBaseUrl = process.env.RAZORPAY_BASE_URL;
  const originalTestKeyId = process.env.RAZORPAY_TEST_KEY_ID;
  const originalTestKeySecret = process.env.RAZORPAY_TEST_KEY_SECRET;

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
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

  const KEY_ID = RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID;
  const KEY_SECRET = RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_SECRET;

  async function buildApp(): Promise<{ app: ReturnType<typeof createApp>; server: MockRazorpayServer }> {
    const mockServer = new MockRazorpayServer({ keyId: KEY_ID, keySecret: KEY_SECRET });
    await mockServer.listen();
    server = mockServer;

    process.env.RAZORPAY_BASE_URL = mockServer.baseUrl;

    // Hermetic regardless of the ambient environment: this test's mock
    // server only recognizes the built-in placeholder credential, so it
    // must not depend on RAZORPAY_TEST_KEY_ID/SECRET being ambiently
    // absent — a machine with real Razorpay live-test credentials
    // configured (for razorpay-live.integration.test.ts) must not leak
    // them in here and get rejected by this mock server as a mismatched
    // credential.
    process.env.RAZORPAY_TEST_KEY_ID = KEY_ID;
    process.env.RAZORPAY_TEST_KEY_SECRET = KEY_SECRET;

    const executionSystem = createExecutionSystem();
    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled", razorpayWebhook: "disabled" });

    return { app, server: mockServer };
  }

  function refundTransaction(overrides: {
    paymentId: string;
    amountPaise: number;
    signals: BusinessTransaction["signals"];
  }): BusinessTransaction {
    const businessTransactionId = crypto.randomUUID();
    const authorityId = crypto.randomUUID();
    const authorizationId = crypto.randomUUID();
    const intentId = crypto.randomUUID();

    return {
      businessTransactionId,

      metadata: {
        businessTransactionId,
        correlationId: crypto.randomUUID(),
        createdBy: "integration-test",
        createdAt: new Date(),
      },

      authority: {
        authorityId,
        authorityType: "USER",
        principalId: "integration-test",
        displayName: "Integration Test",
        issuedAt: new Date(),
      },

      authorization: {
        authorizationId,
        authorityId,
        purpose: "Integration Test",
        authorizedAt: new Date(),
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
        createdAt: new Date(),
      },

      policy: {
        name: "razorpay-refund",
        version: "1.0.0",
        schemaVersion: "1.0.0",
      },

      signals: overrides.signals,

      decision: { outcome: "APPROVED" },
      status: "APPROVED",
      createdAt: new Date(),
    } as unknown as BusinessTransaction;
  }

  it("authorizes and executes a real refund through POST /execute, landing on the mock Razorpay server", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setPayment({
      id: "pay_HTTP001",
      entity: "payment",
      status: "captured",
      amount: 1000000,
      currency: "INR",
      amount_refunded: 0,
      captured: true,
    });

    const transaction = refundTransaction({
      paymentId: "pay_HTTP001",
      amountPaise: 250000,
      signals: {
        paymentStatus: "captured",
        paymentCurrency: "INR",
        refundableRemainingPaise: 1000000,
        requestedRefundAmountPaise: 250000,
        requestedExceedsRemainder: false,
        dailyCumulativeAfterThisRefundPaise: 250000,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(200);

    // The strongest proof this went through the real HTTP surface end to
    // end: a refund actually landed on the (mock) Razorpay server, not
    // just that the API returned 200.
    const refunds = mockServer.refundsFor("pay_HTTP001");
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.amount).toBe(250000);
    expect(refunds[0]?.notes?.parmana_txn).toBe(transaction.businessTransactionId);
  });

  it("rejects by policy through POST /execute and never calls Razorpay when the payment is not captured", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setPayment({
      id: "pay_HTTP002",
      entity: "payment",
      status: "authorized",
      amount: 500000,
      currency: "INR",
      amount_refunded: 0,
      captured: false,
    });

    const transaction = refundTransaction({
      paymentId: "pay_HTTP002",
      amountPaise: 100000,
      signals: {
        paymentStatus: "authorized",
        paymentCurrency: "INR",
        refundableRemainingPaise: 500000,
        requestedRefundAmountPaise: 100000,
        requestedExceedsRemainder: false,
        dailyCumulativeAfterThisRefundPaise: 100000,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    // A policy denial is a deliberate, correct rejection — 403, distinct
    // from a genuine server error (500) or a replayed authorization (409).
    expect(response.status).toBe(403);
    expect(response.body.error).toContain("rejected");
    expect(response.body.code).toBe("POLICY_DENIED");

    expect(mockServer.refundsFor("pay_HTTP002")).toHaveLength(0);
  });

  it("rejects by policy through POST /execute when caller-declared signals misrepresent the real Razorpay payment state", async () => {
    const { app, server: mockServer } = await buildApp();

    // Real payment: only 50000 paise remain refundable (950000 of 1000000 already refunded).
    mockServer.setPayment({
      id: "pay_HTTP003",
      entity: "payment",
      status: "captured",
      amount: 1000000,
      currency: "INR",
      amount_refunded: 950000,
      captured: true,
    });

    // Caller-declared signals falsely claim the full amount is still refundable, so a
    // 250000-paise request appears within the remainder -- untrue against the real payment.
    const transaction = refundTransaction({
      paymentId: "pay_HTTP003",
      amountPaise: 250000,
      signals: {
        paymentStatus: "captured",
        paymentCurrency: "INR",
        refundableRemainingPaise: 1000000,
        requestedRefundAmountPaise: 250000,
        requestedExceedsRemainder: false,
        dailyCumulativeAfterThisRefundPaise: 250000,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");

    // The strongest proof: no refund reached the (mock) Razorpay server, even though the
    // caller-declared signals alone would have satisfied every policy rule.
    expect(mockServer.refundsFor("pay_HTTP003")).toHaveLength(0);
  });

  it("(TD-22) rejects by policy through POST /execute when razorpay:refund-create is paired with an unrelated, unprotected policy", async () => {
    const { app, server: mockServer } = await buildApp();

    // Real payment: the full 1000000 paise is refundable.
    mockServer.setPayment({
      id: "pay_HTTP004",
      entity: "payment",
      status: "captured",
      amount: 1000000,
      currency: "INR",
      amount_refunded: 0,
      captured: true,
    });

    // The exact live-shaped exploit found during Phase 2K's marketing-claim
    // verification: razorpay:refund-create (a fund-moving capability whose
    // amount/payment-state protections are scoped to razorpay-refund/1.0.0's
    // own boundSignals) paired with customer-refund/1.0.0 -- a real,
    // production-loadable policy (PARMANA_POLICY_DIR=./policies) that
    // declares no boundSignals at all. Its own approve rule is trivially
    // satisfiable by caller-declared signals alone, entirely decoupled from
    // the real intent.parameters.amountPaise that would actually execute.
    const transaction = {
      ...refundTransaction({
        paymentId: "pay_HTTP004",
        // The real amount that would execute if this were approved --
        // far beyond razorpay-refund/1.0.0's own per-refund cap (500000)
        // and customer-refund/1.0.0's own maximumRefundAmount (10000).
        amountPaise: 999999,
        signals: {
          // Satisfies customer-refund/1.0.0's approve-refund rule.
          refundEligible: true,
          managerApproved: true,
          fraudCheckPassed: true,
          refundAmount: 1,
        },
      }),
      policy: {
        name: "customer-refund",
        version: "1.0.0",
        schemaVersion: "1.0.0",
      },
    };

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");
    expect(response.body.error).toContain("razorpay:refund-create");
    expect(response.body.error).toContain("razorpay-refund");
    expect(response.body.error).toContain("customer-refund");

    // The strongest proof: no refund reached the (mock) Razorpay server --
    // the mismatched policy never even reaches PolicyEngine.evaluate.
    expect(mockServer.refundsFor("pay_HTTP004")).toHaveLength(0);
  });
});
