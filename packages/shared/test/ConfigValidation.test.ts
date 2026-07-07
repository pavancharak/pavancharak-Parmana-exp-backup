import { afterEach, describe, expect, it } from "vitest";

import { parseStorageProvider } from "../src/config/ConfigValidation.js";

describe("parseStorageProvider", () => {
  afterEach(() => {
    delete process.env.DATABASE_PROVIDER;
  });

  it("selects the provider named by PARMANA_STORAGE", () => {
    expect(parseStorageProvider("memory")).toBe("memory");
    expect(parseStorageProvider("supabase")).toBe("supabase");
  });

  it("defaults to memory when PARMANA_STORAGE is unset", () => {
    expect(parseStorageProvider(undefined)).toBe("memory");
  });

  it("throws naming the invalid value for an unrecognized PARMANA_STORAGE", () => {
    expect(() => parseStorageProvider("sqlite")).toThrow(
      "Invalid PARMANA_STORAGE: sqlite",
    );
  });

  it("fails at startup naming the replacement when the retired DATABASE_PROVIDER is present", () => {
    process.env.DATABASE_PROVIDER = "supabase";

    expect(() => parseStorageProvider("memory")).toThrow(
      "DATABASE_PROVIDER is no longer read; set PARMANA_STORAGE instead.",
    );
  });
});
