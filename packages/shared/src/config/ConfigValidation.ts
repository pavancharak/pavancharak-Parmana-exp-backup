import {
  CryptoModes,
  type CryptoMode,
  HashAlgorithms,
  type HashAlgorithm,
  SignatureAlgorithms,
  type SignatureAlgorithm,
} from "./CryptoAlgorithms.js";

import { StorageProviders, type StorageProvider } from "./StorageProviders.js";

import { KeyProviders, type KeyProvider } from "./KeyProviders.js";

import { TrustProfiles, type TrustProfile } from "./TrustProfiles.js";

import type { ApiKeyEntry } from "./ApiKeyEntry.js";

function parse<T extends string>(
  value: string | undefined,
  values: Record<string, T>,
  name: string,
  defaultValue: T,
): T {
  const resolved = value ?? defaultValue;

  if (Object.values(values).includes(resolved as T)) {
    return resolved as T;
  }

  throw new Error(`Invalid ${name}: ${resolved}`);
}

export const parseStorageProvider = (value?: string): StorageProvider => {
  if (process.env.DATABASE_PROVIDER !== undefined) {
    throw new Error(
      "DATABASE_PROVIDER is no longer read; set PARMANA_STORAGE instead.",
    );
  }

  return parse(value, StorageProviders, "PARMANA_STORAGE", StorageProviders.MEMORY);
};

export const parseCryptoMode = (value?: string): CryptoMode =>
  parse(value, CryptoModes, "CRYPTO_MODE", CryptoModes.SINGLE);

export const parseHashAlgorithm = (value?: string): HashAlgorithm =>
  parse(value, HashAlgorithms, "HASH_PROVIDER", HashAlgorithms.SHA256);

export const parseSignatureAlgorithm = (value?: string): SignatureAlgorithm =>
  parse(
    value,
    SignatureAlgorithms,
    "SIGNATURE_PROVIDER",
    SignatureAlgorithms.ED25519,
  );

export const parseKeyProvider = (value?: string): KeyProvider =>
  parse(value, KeyProviders, "KEY_PROVIDER", KeyProviders.LOCAL);

export const parseTrustProfile = (value?: string): TrustProfile =>
  parse(value, TrustProfiles, "TRUST_PROFILE", TrustProfiles.V1);

const API_KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Parses PARMANA_API_KEYS: a JSON array of
 * { "callerId": string, "keyHash": string } entries.
 *
 * Returns an empty array when unset — callers of this
 * function decide what an empty result means (the
 * caller-authenticator bootstrap treats it as "refuse to
 * start unless auth is explicitly disabled").
 */
export function parseApiKeys(value?: string): ApiKeyEntry[] {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      "PARMANA_API_KEYS is not valid JSON. Expected an array of " +
        '{ "callerId": string, "keyHash": string } entries.',
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "PARMANA_API_KEYS must be a JSON array of " +
        '{ "callerId": string, "keyHash": string } entries.',
    );
  }

  return parsed.map((entry, index): ApiKeyEntry => {
    const record = entry as Record<string, unknown>;

    const validEntry =
      typeof entry === "object" &&
      entry !== null &&
      typeof record.callerId === "string" &&
      record.callerId !== "" &&
      typeof record.keyHash === "string" &&
      API_KEY_HASH_PATTERN.test(record.keyHash);

    if (!validEntry) {
      throw new Error(
        `PARMANA_API_KEYS[${index}] is invalid. Each entry must be ` +
          '{ "callerId": non-empty string, "keyHash": 64-character lowercase hex }.',
      );
    }

    const allowedPrincipalIds = record.allowedPrincipalIds;

    if (allowedPrincipalIds !== undefined) {
      const validAllowedPrincipalIds =
        Array.isArray(allowedPrincipalIds) &&
        allowedPrincipalIds.every(
          (id) => typeof id === "string" && id !== "",
        );

      if (!validAllowedPrincipalIds) {
        throw new Error(
          `PARMANA_API_KEYS[${index}].allowedPrincipalIds must be an array ` +
            "of non-empty strings when present.",
        );
      }
    }

    return {
      callerId: record.callerId as string,
      keyHash: record.keyHash as string,
      ...(allowedPrincipalIds !== undefined
        ? { allowedPrincipalIds: allowedPrincipalIds as readonly string[] }
        : {}),
    };
  });
}
