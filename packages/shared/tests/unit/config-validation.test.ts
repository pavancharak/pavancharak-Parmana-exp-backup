import { afterEach, describe, expect, it } from "vitest";

import { parseApiKeys, parseCryptoMode, parseStorageProvider } from "../../src/config/ConfigValidation.js";

describe("parseCryptoMode", () => {
  it("selects the mode named by CRYPTO_MODE", () => {
    expect(parseCryptoMode("single")).toBe("single");
    expect(parseCryptoMode("hybrid")).toBe("hybrid");
    expect(parseCryptoMode("pq")).toBe("pq");
  });

  it("defaults to single when CRYPTO_MODE is unset", () => {
    expect(parseCryptoMode(undefined)).toBe("single");
  });

  it("throws naming the invalid value for an unrecognized CRYPTO_MODE", () => {
    expect(() => parseCryptoMode("quantum")).toThrow(
      "Invalid CRYPTO_MODE: quantum",
    );
  });
});

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

describe("parseApiKeys", () => {
  const validHash = "a".repeat(64);
  const otherHash = "b".repeat(64);

  it("returns an empty array when PARMANA_API_KEYS is unset", () => {
    expect(parseApiKeys(undefined)).toEqual([]);
  });

  it("returns an empty array when PARMANA_API_KEYS is blank", () => {
    expect(parseApiKeys("  ")).toEqual([]);
  });

  it("parses a single well-formed entry", () => {
    expect(
      parseApiKeys(
        JSON.stringify([{ callerId: "caller-1", keyHash: validHash }]),
      ),
    ).toEqual([{ callerId: "caller-1", keyHash: validHash }]);
  });

  it("parses multiple entries, including repeated callerIds for rotation", () => {
    expect(
      parseApiKeys(
        JSON.stringify([
          { callerId: "caller-1", keyHash: validHash },
          { callerId: "caller-1", keyHash: otherHash },
        ]),
      ),
    ).toEqual([
      { callerId: "caller-1", keyHash: validHash },
      { callerId: "caller-1", keyHash: otherHash },
    ]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseApiKeys("not json")).toThrow(
      "PARMANA_API_KEYS is not valid JSON",
    );
  });

  it("throws when the value is not a JSON array", () => {
    expect(() =>
      parseApiKeys(JSON.stringify({ callerId: "caller-1", keyHash: validHash })),
    ).toThrow("PARMANA_API_KEYS must be a JSON array");
  });

  it("throws naming the index of an entry missing callerId", () => {
    expect(() =>
      parseApiKeys(JSON.stringify([{ keyHash: validHash }])),
    ).toThrow("PARMANA_API_KEYS[0] is invalid");
  });

  it("throws naming the index of an entry with a malformed keyHash", () => {
    expect(() =>
      parseApiKeys(
        JSON.stringify([{ callerId: "caller-1", keyHash: "too-short" }]),
      ),
    ).toThrow("PARMANA_API_KEYS[0] is invalid");
  });

  it("throws on an empty callerId", () => {
    expect(() =>
      parseApiKeys(JSON.stringify([{ callerId: "", keyHash: validHash }])),
    ).toThrow("PARMANA_API_KEYS[0] is invalid");
  });
});

