import { afterEach, describe, expect, it } from "vitest";

import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { SupabaseNonceStore } from "@parmana/storage";

import { createNonceStore } from "../../../src/bootstrap/createNonceStore.js";

const ENV_KEYS = [
  "NODE_ENV",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;

describe("createNonceStore", () => {
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

  it("returns MemoryNonceStore when NODE_ENV=test, regardless of Supabase configuration", () => {
    process.env.NODE_ENV = "test";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    expect(createNonceStore()).toBeInstanceOf(MemoryNonceStore);
  });

  it("(G-13) fails closed with a named, actionable error when NODE_ENV is not test and Supabase is not configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    expect(() => createNonceStore()).toThrow(/SUPABASE_URL/);
    expect(() => createNonceStore()).toThrow(/NonceStore/);
    expect(() => createNonceStore()).toThrow(/G-13/);
  });

  it("never silently falls back to MemoryNonceStore in production wiring when Supabase is unconfigured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    let result: unknown;
    try {
      result = createNonceStore();
    } catch {
      // expected
    }

    expect(result).toBeUndefined();
  });

  it("returns SupabaseNonceStore when NODE_ENV is not test and Supabase is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    delete process.env.SUPABASE_ANON_KEY;

    expect(createNonceStore()).toBeInstanceOf(SupabaseNonceStore);
  });

  it("accepts SUPABASE_ANON_KEY as an alternative to SUPABASE_SERVICE_ROLE_KEY", () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_ANON_KEY = "test-anon-key";

    expect(createNonceStore()).toBeInstanceOf(SupabaseNonceStore);
  });
});
