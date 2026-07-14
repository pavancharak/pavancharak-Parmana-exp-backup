import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MockRazorpayServer,
  RAZORPAY_PAYMENT_FETCH_CAPABILITY,
  RAZORPAY_REFUND_CREATE_CAPABILITY,
  RazorpayConnector,
  brandCredentialHandle,
  connectorCapabilities,
  type ConnectorExecutionContext,
  type RazorpayPayment,
} from "../../src/index.js";

const KEY_ID = "rzp_test_1234567890";
const KEY_SECRET = "super_secret_value_never_leaked";

let server: MockRazorpayServer;

beforeEach(async () => {
  server = new MockRazorpayServer({ keyId: KEY_ID, keySecret: KEY_SECRET });
  await server.listen();
});

afterEach(async () => {
  await server.close();
});

function context(overrides: Partial<ConnectorExecutionContext> = {}): ConnectorExecutionContext {
  return {
    credential: brandCredentialHandle({
      providerId: "static",
      credentialId: "razorpay",
      value: { keyId: KEY_ID, keySecret: KEY_SECRET },
    }),
    timeoutMs: 2_000,
    requestedAt: new Date(),
    ...overrides,
  };
}

function connector(): RazorpayConnector {
  return new RazorpayConnector({
    connectorId: "razorpay",
    capabilities: connectorCapabilities([RAZORPAY_PAYMENT_FETCH_CAPABILITY, RAZORPAY_REFUND_CREATE_CAPABILITY]),
    baseUrl: server.baseUrl,
  });
}

function capturedPayment(overrides: Partial<RazorpayPayment> = {}): RazorpayPayment {
  return {
    id: "pay_ABC123",
    entity: "payment",
    status: "captured",
    amount: 100000,
    currency: "INR",
    amount_refunded: 0,
    captured: true,
    ...overrides,
  };
}

describe("RazorpayConnector", () => {
  it("fetches a payment", async () => {
    server.setPayment(capturedPayment());

    const result = await connector().execute(
      {
        capability: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
        businessTransactionId: "txn-1",
        action: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
        target: "payments/pay_ABC123",
        parameters: { paymentId: "pay_ABC123" },
      },
      context(),
    );

    expect(result.success).toBe(true);
    expect((result.metadata?.payment as RazorpayPayment).id).toBe("pay_ABC123");
    expect((result.metadata?.payment as RazorpayPayment).status).toBe("captured");
  });

  it("creates a refund carrying the parmana transaction id in notes", async () => {
    server.setPayment(capturedPayment());

    const result = await connector().execute(
      {
        capability: RAZORPAY_REFUND_CREATE_CAPABILITY,
        businessTransactionId: "txn-refund-1",
        action: RAZORPAY_REFUND_CREATE_CAPABILITY,
        target: "payments/pay_ABC123/refund",
        parameters: { paymentId: "pay_ABC123", amountPaise: 25000, reason: "requested by customer" },
      },
      context(),
    );

    expect(result.success).toBe(true);
    const metadata = result.metadata as { refund: { id: string; amount: number; notes: Record<string, string> }; idempotent: boolean };
    expect(metadata.refund.id).toMatch(/^rfnd_/);
    expect(metadata.refund.amount).toBe(25000);
    expect(metadata.refund.notes.parmana_txn).toBe("txn-refund-1");
    expect(metadata.idempotent).toBe(false);
    expect(server.refundsFor("pay_ABC123")).toHaveLength(1);
  });

  it("application-level idempotency: a second refund request with the same transaction id returns the existing refund and never calls create again", async () => {
    server.setPayment(capturedPayment());
    const client = connector();

    const request = {
      capability: RAZORPAY_REFUND_CREATE_CAPABILITY,
      businessTransactionId: "txn-refund-idem",
      action: RAZORPAY_REFUND_CREATE_CAPABILITY,
      target: "payments/pay_ABC123/refund",
      parameters: { paymentId: "pay_ABC123", amountPaise: 10000, reason: "duplicate call" },
    };

    const first = await client.execute(request, context());
    const second = await client.execute(request, context());

    const firstRefund = (first.metadata as { refund: { id: string } }).refund;
    const secondMetadata = second.metadata as { refund: { id: string }; idempotent: boolean };

    expect(secondMetadata.refund.id).toBe(firstRefund.id);
    expect(secondMetadata.idempotent).toBe(true);
    // Only one refund was ever actually created on the Razorpay side.
    expect(server.refundsFor("pay_ABC123")).toHaveLength(1);
  });

  it("fails closed on a non-2xx response", async () => {
    // No payment seeded: the mock server returns 404.
    await expect(
      connector().execute(
        {
          capability: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          businessTransactionId: "txn-missing",
          action: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          target: "payments/pay_missing",
          parameters: { paymentId: "pay_missing" },
        },
        context(),
      ),
    ).rejects.toThrow("HTTP 404");
  });

  it("fails closed on a timeout, never returning a partial success", async () => {
    server.setPayment(capturedPayment());
    server.setResponseDelayMs(200);

    await expect(
      connector().execute(
        {
          capability: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          businessTransactionId: "txn-timeout",
          action: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          target: "payments/pay_ABC123",
          parameters: { paymentId: "pay_ABC123" },
        },
        context({ timeoutMs: 20 }),
      ),
    ).rejects.toThrow(/timed out after 20ms/);
  });

  it("rejects a credential that is not a resolved Razorpay key_id/key_secret pair", async () => {
    server.setPayment(capturedPayment());

    await expect(
      connector().execute(
        {
          capability: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          businessTransactionId: "txn-bad-cred",
          action: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          target: "payments/pay_ABC123",
          parameters: { paymentId: "pay_ABC123" },
        },
        context({
          credential: brandCredentialHandle({ providerId: "static", credentialId: "razorpay", value: { token: "not-razorpay-shaped" } }),
        }),
      ),
    ).rejects.toThrow(/resolved Razorpay key_id\/key_secret pair/);
  });

  it("never leaks key_secret into a thrown error, even on an authentication failure against the mock server", async () => {
    server.setPayment(capturedPayment());

    let caught: unknown;
    try {
      await connector().execute(
        {
          capability: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          businessTransactionId: "txn-wrong-secret",
          action: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          target: "payments/pay_ABC123",
          parameters: { paymentId: "pay_ABC123" },
        },
        context({
          credential: brandCredentialHandle({
            providerId: "static",
            credentialId: "razorpay",
            value: { keyId: KEY_ID, keySecret: "wrong-secret" },
          }),
        }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("HTTP 401");
    expect((caught as Error).message).not.toContain(KEY_SECRET);
    expect((caught as Error).message).not.toContain("wrong-secret");
  });

  it("never places key_secret in connector response metadata, only a redacted key_id", async () => {
    server.setPayment(capturedPayment());

    const result = await connector().execute(
      {
        capability: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
        businessTransactionId: "txn-redaction",
        action: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
        target: "payments/pay_ABC123",
        parameters: { paymentId: "pay_ABC123" },
      },
      context(),
    );

    expect(JSON.stringify(result)).not.toContain(KEY_SECRET);
    expect(result.metadata?.keyIdRedacted).toBe("rzp_test...");
  });
});
