import { afterEach, describe, expect, it } from "vitest";

import { StorageFactory } from "../../src/StorageFactory.js";
import { MemoryStorageProvider } from "../../src/memory/MemoryStorageProvider.js";
import { SupabaseStorageProvider } from "../../src/supabase/SupabaseStorageProvider.js";

const ENV_KEYS = [
  "NODE_ENV",
  "PARMANA_STORAGE",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;

/**
 * Unit coverage for the G-15 test-safety fix: createFromEnvironment must
 * never construct a live Supabase client under NODE_ENV=test, and must
 * fail with a named, actionable error rather than supabase-js's generic
 * "supabaseUrl is required." when misconfigured outside test.
 */
describe("StorageFactory.createFromEnvironment", () => {
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

  it("(G-15) returns MemoryStorageProvider when NODE_ENV=test, regardless of PARMANA_STORAGE", () => {
    process.env.NODE_ENV = "test";
    process.env.PARMANA_STORAGE = "supabase";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    expect(StorageFactory.createFromEnvironment()).toBeInstanceOf(
      MemoryStorageProvider,
    );
  });

  it("(G-15) returns MemoryStorageProvider when NODE_ENV=test even with Supabase credentials present", () => {
    process.env.NODE_ENV = "test";
    process.env.PARMANA_STORAGE = "supabase";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    expect(StorageFactory.createFromEnvironment()).toBeInstanceOf(
      MemoryStorageProvider,
    );
  });

  it("(G-15) fails with a named, actionable error when NODE_ENV is not test, PARMANA_STORAGE=supabase, and Supabase is not configured", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "supabase";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    expect(() => StorageFactory.createFromEnvironment()).toThrow(
      /PARMANA_STORAGE=supabase/,
    );
    expect(() => StorageFactory.createFromEnvironment()).toThrow(
      /SUPABASE_URL/,
    );
  });

  it("returns SupabaseStorageProvider when NODE_ENV is not test and Supabase is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "supabase";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    expect(StorageFactory.createFromEnvironment()).toBeInstanceOf(
      SupabaseStorageProvider,
    );
  });

  it("returns MemoryStorageProvider when NODE_ENV is not test and PARMANA_STORAGE=memory", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_STORAGE = "memory";

    expect(StorageFactory.createFromEnvironment()).toBeInstanceOf(
      MemoryStorageProvider,
    );
  });
});
