import { afterEach, describe, expect, it } from "vitest";

import { assertStorageConfigured } from "../../../src/bootstrap/assertStorageConfigured.js";

const ENV_KEYS = ["NODE_ENV", "PARMANA_STORAGE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"] as const;

describe("assertStorageConfigured", () => {
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

  it("is a no-op when NODE_ENV=test, regardless of storage configuration", () => {
    process.env.NODE_ENV = "test";
    process.env.PARMANA_STORAGE = "supabase";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    expect(() => assertStorageConfigured()).not.toThrow();
  });

  it("is a no-op outside test mode when PARMANA_STORAGE=memory", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "memory";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    expect(() => assertStorageConfigured()).not.toThrow();
  });

  it("fails closed with a named, actionable error when PARMANA_STORAGE=supabase and Supabase is not configured", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "supabase";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    expect(() => assertStorageConfigured()).toThrow(/SUPABASE_URL/);
    expect(() => assertStorageConfigured()).toThrow(/Storage/);
  });

  it("does not throw when PARMANA_STORAGE=supabase and Supabase is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "supabase";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    delete process.env.SUPABASE_ANON_KEY;

    expect(() => assertStorageConfigured()).not.toThrow();
  });
});
