import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryGatewaySessionStore,
  MemoryExecutionAuditSink,
} from "@parmana/execution-control";

import { createConnectorRegistry } from "../../../src/bootstrap/createConnectorRegistry.js";
import { createConnectorAuthenticator } from "../../../src/bootstrap/createConnectorAuthenticator.js";

const ENV_KEYS = ["NODE_ENV", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"] as const;

function buildRegistry() {
  const authenticator = createConnectorAuthenticator();
  const sessions = new InMemoryGatewaySessionStore(Object.freeze({}));
  const audit = new MemoryExecutionAuditSink();
  return createConnectorRegistry(authenticator, sessions, audit, Object.freeze({ token: "test" }));
}

describe("createConnectorRegistry — razorpay capability availability", () => {
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

  it("registers the razorpay connector and resolves both capabilities when NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";

    const registry = buildRegistry();

    expect(registry.resolveCapability("razorpay:refund-create").connectorId).toBe("razorpay");
    expect(registry.resolveCapability("razorpay:payment-fetch").connectorId).toBe("razorpay");
  });

  it("still registers vendor-payment unchanged alongside razorpay", () => {
    process.env.NODE_ENV = "test";

    const registry = buildRegistry();

    expect(registry.resolveCapability("payments:execute").connectorId).toBe("vendor-payment");
  });

  it("(fail-closed) does not register razorpay, and resolveCapability throws, when credentials are unconfigured outside test mode", () => {
    process.env.NODE_ENV = "production";
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    const registry = buildRegistry();

    expect(() => registry.resolveCapability("razorpay:refund-create")).toThrow(
      /No connector registered for capability 'razorpay:refund-create'/,
    );
  });

  it("does not fail startup of the whole registry when razorpay credentials are missing — vendor-payment remains resolvable", () => {
    process.env.NODE_ENV = "production";
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    const registry = buildRegistry();

    expect(registry.resolveCapability("payments:execute").connectorId).toBe("vendor-payment");
  });

  it("registers razorpay when credentials are fully configured outside test mode", () => {
    process.env.NODE_ENV = "production";
    process.env.RAZORPAY_KEY_ID = "rzp_live_real_id";
    process.env.RAZORPAY_KEY_SECRET = "rzp_live_real_secret";

    const registry = buildRegistry();

    expect(registry.resolveCapability("razorpay:refund-create").connectorId).toBe("razorpay");
  });
});
