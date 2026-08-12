import "dotenv/config";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

import { parseApiKeys } from "@parmana/shared";

export interface ApiKeyEntry {
  callerId: string;
  keyHash: string;
  allowedPrincipalIds?: string[];
  allowedCapabilities?: string[];
}

export interface GeneratedApiKey {
  rawKey: string;
  entry: ApiKeyEntry;
}

export interface GenerateApiKeyOptions {
  callerId: string;
  allowedPrincipalIds?: string[];
  allowedCapabilities?: string[];
}

export interface AppendApiKeyOptions {
  replace?: boolean;
}

export interface AppendApiKeyResult {
  totalEntries: number;
}

const API_KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function generateApiKey({
  callerId,
  allowedPrincipalIds,
  allowedCapabilities,
}: GenerateApiKeyOptions): GeneratedApiKey {
  const normalizedCallerId = callerId.trim();

  if (!normalizedCallerId) {
    throw new Error("--caller-id must be a non-empty string.");
  }

  const normalizedPrincipalIds = allowedPrincipalIds
    ?.map((id) => id.trim())
    .filter(Boolean);

  const normalizedCapabilities = allowedCapabilities
    ?.map((capability) => capability.trim())
    .filter(Boolean);

  const rawKey = randomBytes(32).toString("base64url");

  const keyHash = createHash("sha256")
    .update(rawKey, "utf8")
    .digest("hex");

  if (!API_KEY_HASH_PATTERN.test(keyHash)) {
    throw new Error("Generated key hash has an invalid format.");
  }

  const entry: ApiKeyEntry = {
    callerId: normalizedCallerId,
    keyHash,
  };

  if (normalizedPrincipalIds && normalizedPrincipalIds.length > 0) {
    entry.allowedPrincipalIds = normalizedPrincipalIds;
  }

  if (normalizedCapabilities && normalizedCapabilities.length > 0) {
    entry.allowedCapabilities = normalizedCapabilities;
  }

  return {
    rawKey,
    entry,
  };
}

export function parseAllowedPrincipalIds(
  value: string | undefined,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error(
      "--allowed-principal-ids contained no non-empty values.",
    );
  }

  return values;
}

/**
 * Parses --allowed-capabilities the same way
 * parseAllowedPrincipalIds parses --allowed-principal-ids. No
 * special-case handling for "*": it is just one more non-empty
 * string value, whose wildcard meaning is interpreted downstream by
 * isCapabilityAllowed.ts, not here.
 */
export function parseAllowedCapabilities(
  value: string | undefined,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error(
      "--allowed-capabilities contained no non-empty values.",
    );
  }

  return values;
}

export function formatApiKeysValue(
  entries: ApiKeyEntry[],
  format: "json" | "env",
): string {
  const json = JSON.stringify(entries);

  if (format === "json") {
    return json;
  }

  return `PARMANA_API_KEYS=${json}`;
}

export function appendApiKeyEntry(
  path: string,
  entry: ApiKeyEntry,
  options: AppendApiKeyOptions = {},
): AppendApiKeyResult {
  let entries: ApiKeyEntry[] = [];

  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8").trim();

    if (existing) {
      const envMatch = existing.match(/^PARMANA_API_KEYS=(.*)$/m);

      if (envMatch) {
        entries = parseApiKeys(envMatch[1]);
      } else {
        entries = parseApiKeys(existing);
      }
    }
  }

  const existingIndex = entries.findIndex(
    (existingEntry) => existingEntry.callerId === entry.callerId,
  );

  if (existingIndex !== -1) {
    if (!options.replace) {
      throw new Error(
        `Caller ID "${entry.callerId}" already has an entry`,
      );
    }

    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }

  const serialized = JSON.stringify(entries);

  if (path.endsWith(".env")) {
    let content = existsSync(path) ? readFileSync(path, "utf8") : "";

    const envLine = `PARMANA_API_KEYS=${serialized}`;

    if (/^PARMANA_API_KEYS=.*$/m.test(content)) {
      content = content.replace(/^PARMANA_API_KEYS=.*$/m, envLine);
    } else {
      if (content.length > 0 && !content.endsWith("\n")) {
        content += "\n";
      }

      content += `${envLine}\n`;
    }

    writeFileSync(path, content);
  } else {
    writeFileSync(path, `${serialized}\n`);
  }

  return {
    totalEntries: entries.length,
  };
}

function argument(args: string[], name: string): string {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
    throw new Error(`Missing argument: ${name}`);
  }

  return args[index + 1];
}

function main(args = process.argv.slice(2)): void {
  const callerId = argument(args, "--caller-id");

  const allowedPrincipalIds = parseAllowedPrincipalIds(
    args.includes("--allowed-principal-ids")
      ? argument(args, "--allowed-principal-ids")
      : undefined,
  );

  const allowedCapabilities = parseAllowedCapabilities(
    args.includes("--allowed-capabilities")
      ? argument(args, "--allowed-capabilities")
      : undefined,
  );

  const { rawKey, entry } = generateApiKey({
    callerId,
    allowedPrincipalIds,
    allowedCapabilities,
  });

  console.log();
  console.log("API key generated");
  console.log("--------------------------------");
  console.log("Caller ID :", entry.callerId);
  console.log("Key       :", rawKey);
  console.log("Key hash  :", entry.keyHash);
  console.log();
  console.log(
    "Give the key above to the caller now. It is not written to disk by",
  );
  console.log(
    "this script and cannot be recovered once this terminal is closed.",
  );
  console.log("Only the hash below is ever persisted.");
  console.log();
  console.log("Add this entry to PARMANA_API_KEYS (a JSON array):");
  console.log(JSON.stringify(entry));
  console.log();
}

if (process.env.NODE_ENV !== "test") {
  main();
}