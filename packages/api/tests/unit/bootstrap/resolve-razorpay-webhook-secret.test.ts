import { afterEach, describe, expect, it } from "vitest";

import { resolveRazorpayWebhookSecret } from "../../../src/bootstrap/resolveRazorpayWebhookSecret.js";

const ENV_KEYS = ["NODE_ENV", "RAZORPAY_TEST_WEBHOOK_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const;

describe("resolveRazorpayWebhookSecret", () => {
  const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("returns the built-in placeholder when NODE_ENV=test and no override is set", () => {
    process.env.NODE_ENV = "test";
    delete process.env.RAZORPAY_TEST_WEBHOOK_SECRET;

    expect(resolveRazorpayWebhookSecret()).toBe("razorpay-webhook-test-placeholder-secret");
  });

  it("honors RAZORPAY_TEST_WEBHOOK_SECRET override in test mode", () => {
    process.env.NODE_ENV = "test";
    process.env.RAZORPAY_TEST_WEBHOOK_SECRET = "overridden-webhook-secret";

    expect(resolveRazorpayWebhookSecret()).toBe("overridden-webhook-secret");
  });

  it("returns undefined (fail closed, route absent) when NODE_ENV is not test and RAZORPAY_WEBHOOK_SECRET is unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.RAZORPAY_WEBHOOK_SECRET;

    expect(resolveRazorpayWebhookSecret()).toBeUndefined();
  });

  it("returns the configured secret when NODE_ENV is not test and RAZORPAY_WEBHOOK_SECRET is set", () => {
    process.env.NODE_ENV = "production";
    process.env.RAZORPAY_WEBHOOK_SECRET = "real-production-webhook-secret";

    expect(resolveRazorpayWebhookSecret()).toBe("real-production-webhook-secret");
  });
});
