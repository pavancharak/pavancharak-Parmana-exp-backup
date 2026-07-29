/**
 * Parmana TypeScript SDK
 *
 * Configuration and ParmanaClient construction tests.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ParmanaClient } from "../src/client/ParmanaClient.js";
import { HttpTransport } from "../src/transport/HttpTransport.js";
import { ConfigurationError } from "../src/errors/ConfigurationError.js";

describe("ParmanaClient construction", () => {
  it("throws ConfigurationError when endpoint is missing", () => {
    expect(
      () =>
        new ParmanaClient({
          endpoint: "",
          transport: new HttpTransport({ endpoint: "" }),
        }),
    ).toThrowError(ConfigurationError);
  });

  it("throws ConfigurationError when transport is missing", () => {
    expect(
      () =>
        new ParmanaClient({
          endpoint: "http://localhost:3000",
        } as never),
    ).toThrowError(ConfigurationError);
  });

  it("accepts apiKey as part of configuration and exposes it via configuration", () => {
    const configuration = {
      endpoint: "http://localhost:3000",
      apiKey: "my-secret-api-key",
      transport: new HttpTransport({
        endpoint: "http://localhost:3000",
        apiKey: "my-secret-api-key",
      }),
    };

    const client = new ParmanaClient(configuration);

    expect(client.configuration.apiKey).toBe("my-secret-api-key");
    expect(client.endpoint()).toBe("http://localhost:3000");
  });
});

describe("apiKey flows end-to-end through ParmanaClient -> HttpTransport -> fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a request issued through ParmanaClient carries the configured Authorization header", async () => {
    let capturedHeaders: Record<string, string> | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, requestInit: RequestInit) => {
        capturedHeaders = requestInit.headers as Record<string, string>;
        return {
          status: 200,
          headers: { forEach: () => {} },
          json: async () => ({ status: "UP" }),
        } as unknown as Response;
      }),
    );

    const endpoint = "http://localhost:3000";
    const apiKey = "my-secret-api-key";

    const client = new ParmanaClient({
      endpoint,
      apiKey,
      transport: new HttpTransport({ endpoint, apiKey }),
    });

    await client.health();

    expect(capturedHeaders?.Authorization).toBe(`Bearer ${apiKey}`);
  });
});
