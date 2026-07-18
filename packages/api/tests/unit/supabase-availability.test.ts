import { afterEach, describe, expect, it } from "vitest";

import { resolveSupabaseGate } from "../helpers/supabase-availability.js";

/**
 * Unit coverage for the G-3 live-credential opt-in guard. These are pure
 * process.env checks with no network dependency, so they can be tested
 * directly without standing up a live Supabase project.
 */
describe("resolveSupabaseGate", () => {
  const ORIGINAL_ENV = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    ALLOW_LIVE_SUPABASE: process.env.ALLOW_LIVE_SUPABASE,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("(case a) throws naming ALLOW_LIVE_SUPABASE when SUPABASE_* is configured without the opt-in", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    delete process.env.ALLOW_LIVE_SUPABASE;

    expect(() => resolveSupabaseGate("Some Suite")).toThrow(
      /ALLOW_LIVE_SUPABASE=1 is not set/,
    );

    expect(() => resolveSupabaseGate("Some Suite")).toThrow(/^Some Suite:/);
  });

  it("(case a) also throws when ALLOW_LIVE_SUPABASE is set to something other than \"1\"", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
    process.env.ALLOW_LIVE_SUPABASE = "true";

    expect(() => resolveSupabaseGate("Some Suite")).toThrow(
      /ALLOW_LIVE_SUPABASE=1 is not set/,
    );
  });

  it("(case b) returns false and does not throw when no SUPABASE_* is configured", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.ALLOW_LIVE_SUPABASE;

    expect(resolveSupabaseGate("Some Suite")).toBe(false);
  });

  it("(case c) returns true and does not throw when SUPABASE_* is configured and ALLOW_LIVE_SUPABASE=1", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    process.env.ALLOW_LIVE_SUPABASE = "1";

    expect(resolveSupabaseGate("Some Suite")).toBe(true);
  });

  it("(case d, G-14) throws naming broken env loading when ALLOW_LIVE_SUPABASE=1 is set but SUPABASE_* is not visible", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    process.env.ALLOW_LIVE_SUPABASE = "1";

    expect(() => resolveSupabaseGate("Some Suite")).toThrow(
      /env loading is broken/,
    );

    expect(() => resolveSupabaseGate("Some Suite")).toThrow(/^Some Suite:/);
  });
});
