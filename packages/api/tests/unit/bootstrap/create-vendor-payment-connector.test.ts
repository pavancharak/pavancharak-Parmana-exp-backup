import { afterEach, describe, expect, it } from "vitest";

import { brandCredentialHandle } from "@parmana/connector-sdk";

import { createVendorPaymentConnector } from "../../../src/bootstrap/createVendorPaymentConnector.js";

/**
 * Phase 2A regression coverage: no real vendor-payment enterprise connector
 * exists yet, so production must never substitute MockConnector for it (see
 * docs/architecture/phase2a-production-connectors.md). Mirrors
 * create-razorpay-credential-provider.test.ts's NODE_ENV=test/production
 * split for the same "returns undefined, fail closed" contract.
 */
describe("createVendorPaymentConnector", () => {
  const original = process.env.NODE_ENV;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = original;
    }
  });

  it("returns undefined outside test mode — no MockConnector fallback in production", () => {
    process.env.NODE_ENV = "production";

    expect(createVendorPaymentConnector()).toBeUndefined();
  });

  it("returns undefined when NODE_ENV is unset (not explicitly test)", () => {
    delete process.env.NODE_ENV;

    expect(createVendorPaymentConnector()).toBeUndefined();
  });

  it("returns a MockConnector when NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";

    const connector = createVendorPaymentConnector();

    expect(connector).toBeDefined();
    expect(connector!.connectorId).toBe("vendor-payment");
    expect(connector!.capabilities.includes("payments:execute")).toBe(true);
  });

  it("the test-mode connector is scripted (in-memory), not a real vendor call — confirms it's still MockConnector's shape", async () => {
    process.env.NODE_ENV = "test";

    const connector = createVendorPaymentConnector();
    const result = await connector!.execute(
      {
        businessTransactionId: "txn-1",
        capability: "payments:execute",
        action: "payments:execute",
        target: "vendor-payment",
        parameters: {},
      },
      {
        credential: brandCredentialHandle({
          providerId: "test",
          credentialId: "test",
          value: {},
        }),
        timeoutMs: 5000,
        requestedAt: new Date(),
      },
    );

    expect(result).toEqual({ success: true, metadata: {} });
  });
});
