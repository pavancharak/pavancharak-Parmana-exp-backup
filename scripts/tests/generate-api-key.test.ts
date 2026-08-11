import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseApiKeys } from "@parmana/shared";

import {
  appendApiKeyEntry,
  formatApiKeysValue,
  generateApiKey,
  parseAllowedPrincipalIds,
} from "../generate-api-key.js";

const API_KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;

describe("generateApiKey", () => {
  it("produces a raw key with 256 bits of entropy", () => {
    const { rawKey } = generateApiKey({ callerId: "caller-1" });

    expect(Buffer.from(rawKey, "base64url")).toHaveLength(32);
  });

  it("produces two different raw keys across two calls", () => {
    const first = generateApiKey({ callerId: "caller-1" });
    const second = generateApiKey({ callerId: "caller-1" });

    expect(first.rawKey).not.toBe(second.rawKey);
  });

  it("produces a keyHash matching the server's hash pattern", () => {
    const { entry } = generateApiKey({ callerId: "caller-1" });

    expect(entry.keyHash).toMatch(API_KEY_HASH_PATTERN);
  });

  it("includes allowedPrincipalIds only when provided", () => {
    const withIds = generateApiKey({
      callerId: "caller-1",
      allowedPrincipalIds: ["principal-a", "principal-b"],
    });
    const withoutIds = generateApiKey({ callerId: "caller-1" });

    expect(withIds.entry.allowedPrincipalIds).toEqual([
      "principal-a",
      "principal-b",
    ]);
    expect(withoutIds.entry.allowedPrincipalIds).toBeUndefined();
  });

  it("rejects an empty caller id", () => {
    expect(() => generateApiKey({ callerId: "   " })).toThrow(
      "--caller-id must be a non-empty string.",
    );
  });

  it("produces an entry that parseApiKeys accepts, matching the generated callerId", () => {
    const { entry } = generateApiKey({ callerId: "design-partner-gocredit" });

    const [parsed] = parseApiKeys(JSON.stringify([entry]));

    expect(parsed).toEqual(entry);
    expect(parsed?.callerId).toBe("design-partner-gocredit");
  });
});

describe("formatApiKeysValue", () => {
  it("round-trips through parseApiKeys in json format", () => {
    const { entry } = generateApiKey({ callerId: "caller-1" });

    const printed = formatApiKeysValue([entry], "json");
    const parsed = parseApiKeys(printed);

    expect(parsed).toEqual([entry]);
  });

  it("round-trips through parseApiKeys in env format", () => {
    const { entry } = generateApiKey({ callerId: "caller-1" });

    const printed = formatApiKeysValue([entry], "env");

    expect(printed.startsWith("PARMANA_API_KEYS=")).toBe(true);

    const parsed = parseApiKeys(printed.slice("PARMANA_API_KEYS=".length));

    expect(parsed).toEqual([entry]);
  });
});

describe("parseAllowedPrincipalIds", () => {
  it("returns undefined when not provided", () => {
    expect(parseAllowedPrincipalIds(undefined)).toBeUndefined();
  });

  it("splits, trims, and drops empty values", () => {
    expect(parseAllowedPrincipalIds(" a , b ,,c")).toEqual(["a", "b", "c"]);
  });

  it("throws when given but every value is empty", () => {
    expect(() => parseAllowedPrincipalIds(" , ,")).toThrow(
      "contained no non-empty values",
    );
  });
});

describe("appendApiKeyEntry", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("creates a new .env-style file when none exists", () => {
    dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
    const path = join(dir, ".env");

    const { entry } = generateApiKey({ callerId: "caller-1" });
    const result = appendApiKeyEntry(path, entry);

    expect(result.totalEntries).toBe(1);

    const content = readFileSync(path, "utf8");
    const parsed = parseApiKeys(
      content.match(/^PARMANA_API_KEYS=(.*)$/m)?.[1] ?? "",
    );

    expect(parsed).toEqual([entry]);
  });

  it("appends to an existing .env file without disturbing other lines", () => {
    dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
    const path = join(dir, ".env");
    writeFileSync(
      path,
      'NODE_ENV=production\nPARMANA_API_KEYS=[{"callerId":"existing","keyHash":"' +
        "0".repeat(64) +
        '"}]\nPORT=3000\n',
    );

    const { entry } = generateApiKey({ callerId: "caller-2" });
    const result = appendApiKeyEntry(path, entry);

    expect(result.totalEntries).toBe(2);

    const content = readFileSync(path, "utf8");

    expect(content).toContain("NODE_ENV=production");
    expect(content).toContain("PORT=3000");

    const parsed = parseApiKeys(
      content.match(/^PARMANA_API_KEYS=(.*)$/m)?.[1] ?? "",
    );

    expect(parsed?.map((e) => e.callerId)).toEqual(["existing", "caller-2"]);
  });

  it("appends to an existing bare JSON array file", () => {
    dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
    const path = join(dir, "api-keys.json");
    writeFileSync(
      path,
      JSON.stringify([{ callerId: "existing", keyHash: "0".repeat(64) }]),
    );

    const { entry } = generateApiKey({ callerId: "caller-2" });
    const result = appendApiKeyEntry(path, entry);

    expect(result.totalEntries).toBe(2);

    const parsed = parseApiKeys(readFileSync(path, "utf8"));

    expect(parsed?.map((e) => e.callerId)).toEqual(["existing", "caller-2"]);
  });

  it("throws on a callerId collision without --replace", () => {
    dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
    const path = join(dir, "api-keys.json");
    writeFileSync(
      path,
      JSON.stringify([{ callerId: "dup", keyHash: "0".repeat(64) }]),
    );

    const { entry } = generateApiKey({ callerId: "dup" });

    expect(() => appendApiKeyEntry(path, entry)).toThrow(
      'Caller ID "dup" already has an entry',
    );

    const untouched = parseApiKeys(readFileSync(path, "utf8"));
    expect(untouched).toEqual([{ callerId: "dup", keyHash: "0".repeat(64) }]);
  });

  it("replaces the colliding entry when --replace is passed", () => {
    dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
    const path = join(dir, "api-keys.json");
    writeFileSync(
      path,
      JSON.stringify([{ callerId: "dup", keyHash: "0".repeat(64) }]),
    );

    const { entry } = generateApiKey({ callerId: "dup" });
    const result = appendApiKeyEntry(path, entry, { replace: true });

    expect(result.totalEntries).toBe(1);

    const parsed = parseApiKeys(readFileSync(path, "utf8"));
    expect(parsed).toEqual([entry]);
  });
});
