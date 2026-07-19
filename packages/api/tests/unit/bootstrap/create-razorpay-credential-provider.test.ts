import { afterEach, describe, expect, it } from "vitest";

import { createRazorpayCredentialProvider } from "../../../src/bootstrap/createRazorpayCredentialProvider.js";

const ENV_KEYS = [
  "NODE_ENV",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_TEST_KEY_ID",
  "RAZORPAY_TEST_KEY_SECRET",
] as const;

describe("createRazorpayCredentialProvider", () => {
  const original = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("returns a static provider with default test credentials when NODE_ENV=test and no overrides are set", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.RAZORPAY_TEST_KEY_ID;
    delete process.env.RAZORPAY_TEST_KEY_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    const provider = createRazorpayCredentialProvider();
    expect(provider).toBeDefined();

    const handle = await provider!.resolve("razorpay");
    expect(handle.value).toEqual({
      keyId: "rzp_test_integration00",
      keySecret: "integration-test-key-secret",
    });
  });

  it("honors RAZORPAY_TEST_KEY_ID / RAZORPAY_TEST_KEY_SECRET overrides in test mode", async () => {
    process.env.NODE_ENV = "test";
    process.env.RAZORPAY_TEST_KEY_ID = "rzp_test_overridden";
    process.env.RAZORPAY_TEST_KEY_SECRET = "overridden-secret";

    const provider = createRazorpayCredentialProvider();
    const handle = await provider!.resolve("razorpay");

    expect(handle.value).toEqual({
      keyId: "rzp_test_overridden",
      keySecret: "overridden-secret",
    });
  });

  it("returns undefined (capability unavailable) when NODE_ENV is not test and neither credential is configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    expect(createRazorpayCredentialProvider()).toBeUndefined();
  });

  it("returns undefined (fail closed) when only RAZORPAY_KEY_ID is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.RAZORPAY_KEY_ID = "rzp_live_only_id";
    delete process.env.RAZORPAY_KEY_SECRET;

    expect(createRazorpayCredentialProvider()).toBeUndefined();
  });

  it("returns undefined (fail closed) when only RAZORPAY_KEY_SECRET is configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.RAZORPAY_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = "rzp_live_only_secret";

    expect(createRazorpayCredentialProvider()).toBeUndefined();
  });

  it("never falls back to a mock or static provider outside test mode, even with credentials configured", async () => {
    process.env.NODE_ENV = "production";
    process.env.RAZORPAY_KEY_ID = "rzp_live_real_id";
    process.env.RAZORPAY_KEY_SECRET = "rzp_live_real_secret";

    const provider = createRazorpayCredentialProvider();
    expect(provider).toBeDefined();
    expect(provider!.providerId).toBe("environment");

    const handle = await provider!.resolve("razorpay");
    expect(handle.value).toEqual({
      keyId: "rzp_live_real_id",
      keySecret: "rzp_live_real_secret",
    });
  });

  it("never embeds the resolved key_secret in a thrown error message", async () => {
    process.env.NODE_ENV = "production";
    process.env.RAZORPAY_KEY_ID = "rzp_live_real_id";
    process.env.RAZORPAY_KEY_SECRET = "super-secret-value-must-not-leak";

    const provider = createRazorpayCredentialProvider();

    try {
      await provider!.resolve("not-razorpay");
      throw new Error("expected resolve() to reject for a mismatched connectorId");
    } catch (error) {
      expect((error as Error).message).not.toContain("super-secret-value-must-not-leak");
    }
  });
});
