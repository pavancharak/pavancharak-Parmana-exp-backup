

import dotenv from "dotenv";

import { existsSync } from "node:fs";

import {
  dirname,
  join,
} from "node:path";

import { fileURLToPath } from "node:url";

import type {
  HashAlgorithm,
  SignatureAlgorithm,
} from "./CryptoAlgorithms.js";

import type { StorageProvider } from "./StorageProviders.js";

import { optionalProperty } from "./ConfigUtils.js";

import type { KeyProvider } from "./KeyProviders.js";

import type { TrustProfile } from "./TrustProfiles.js";

import type { ApiKeyEntry } from "./ApiKeyEntry.js";

import {
  parseStorageProvider,
  parseHashAlgorithm,
  parseSignatureAlgorithm,
  parseKeyProvider,
  parseTrustProfile,
  parseApiKeys,
} from "./ConfigValidation.js";

/**
 * Resolve the repository .env file.
 *
 * This implementation is independent of the
 * current working directory, allowing every
 * Parmana package to share the same
 * configuration.
 */
const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  dirname(__filename);

function findEnvFile():
  | string
  | undefined {
  let current = __dirname;

  while (true) {
    const candidate = join(
      current,
      ".env",
    );

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent =
      dirname(current);

    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

const envFile =
  findEnvFile();

if (envFile) {
  dotenv.config({
    path: envFile,
  });
} else {
  dotenv.config();
}

/**
 * Parmana Configuration.
 *
 * Centralized immutable configuration.
 *
 * This is the only configuration model used by
 * Parmana. Environment variables are converted
 * into strongly typed values through the
 * ConfigValidation module.
 */

/**
 * Root configuration.
 */
export interface Config {
  readonly environment:
    EnvironmentConfig;

  readonly storage:
    StorageConfig;

  readonly crypto:
    CryptoConfig;

  readonly keys:
    KeyConfig;

  readonly authorization:
    AuthorizationConfig;

  readonly policy:
    PolicyConfig;

  readonly trust:
    TrustConfig;

  readonly api:
    ApiConfig;

  readonly auth:
    ApiAuthConfig;

  readonly logging:
    LoggingConfig;
}
/**
 * Runtime environment.
 */
export interface EnvironmentConfig {
  readonly nodeEnv: string;
}

/**
 * Storage configuration.
 */
export interface StorageConfig {
  readonly provider:
    StorageProvider;

  readonly databaseUrl?: string;
}


/**
 * Cryptographic configuration.
 */
export interface CryptoConfig {
  /**
   * Crypto operating mode.
   */
  readonly mode:
    | "single"
    | "hybrid"
    | "pq";

  /**
   * Hash algorithm.
   */
  readonly hashProvider:
    HashAlgorithm;

  /**
   * Primary signature algorithm.
   */
  readonly primarySignatureProvider:
    SignatureAlgorithm;

  /**
   * Secondary signature algorithm.
   *
   * Required only in hybrid mode.
   */
  readonly secondarySignatureProvider?:
    SignatureAlgorithm;
}
/**
 * Key management.
 */
export interface KeyConfig {
  readonly provider:
    KeyProvider;

  /**
   * Root directory containing all Parmana keys.
   */
  readonly keyDirectory:
    string;
}
/**
 * Execution authorization configuration.
 */
export interface AuthorizationConfig {
  /**
   * Default TTL, in seconds, applied to a signed
   * Execution Authorization when the caller does
   * not specify one.
   */
  readonly ttlSeconds: number;
}
/**
 * Policy configuration.
 */
export interface PolicyConfig {
  /**
   * Root directory containing policy files.
   */
  readonly directory: string;
}

/**
 * Trust profile configuration.
 */
export interface TrustConfig {
  readonly profile:
    TrustProfile;

  readonly receiptVersion: string;
}

/**
 * API configuration.
 */
export interface ApiConfig {
  readonly port: number;
}

/**
 * API caller authentication.
 *
 * Fail-closed by design: an empty `keys` array means the
 * caller-authenticator bootstrap refuses to start the
 * server unless `disabled` is explicitly true (local
 * development and tutorials only).
 */
export interface ApiAuthConfig {
  readonly keys:
    readonly ApiKeyEntry[];

  readonly disabled:
    boolean;
}

/**
 * Logging configuration.
 */
export interface LoggingConfig {
  readonly level: string;
}

/**
 * Loads the immutable Parmana configuration.
 *
 * This is the only location where process.env
 * should be accessed.
 */
export function loadConfig():
  Readonly<Config> {
  return Object.freeze({
    environment: Object.freeze({
      nodeEnv:
        process.env.NODE_ENV ??
        "development",
    }),

    storage: Object.freeze({
      provider:
        parseStorageProvider(
          process.env.PARMANA_STORAGE,
        ),

      ...optionalProperty(
        "databaseUrl",
        process.env.DATABASE_URL,
      ),
    }),

    crypto: Object.freeze({
  mode:
    (process.env.CRYPTO_MODE as
      | "single"
      | "hybrid"
      | "pq") ??
    "single",

  hashProvider:
    parseHashAlgorithm(
      process.env.HASH_PROVIDER,
    ),

  primarySignatureProvider:
    parseSignatureAlgorithm(
      process.env.PRIMARY_SIGNATURE_PROVIDER,
    ),

  ...optionalProperty(
    "secondarySignatureProvider",
    process.env
      .SECONDARY_SIGNATURE_PROVIDER
        ? parseSignatureAlgorithm(
            process.env
              .SECONDARY_SIGNATURE_PROVIDER,
          )
        : undefined,
  ),
}),

    keys: Object.freeze({
  provider:
    parseKeyProvider(
      process.env.KEY_PROVIDER,
    ),

  keyDirectory:
    process.env.PARMANA_KEY_DIR!,
}),

    authorization: Object.freeze({
      ttlSeconds: Number(
        process.env
          .EXECUTION_AUTHORIZATION_TTL_SECONDS ??
          120,
      ),
    }),
policy: Object.freeze({
  directory:
    process.env.PARMANA_POLICY_DIR!,
}),

    trust: Object.freeze({
      profile:
        parseTrustProfile(
          process.env.TRUST_PROFILE,
        ),

      receiptVersion:
        process.env.RECEIPT_VERSION ??
        "1",
    }),

    api: Object.freeze({
      port: Number(
        process.env.PORT ?? 3000,
      ),
    }),

    auth: Object.freeze({
      keys:
        parseApiKeys(
          process.env.PARMANA_API_KEYS,
        ),

      disabled:
        process.env.PARMANA_AUTH_DISABLED ===
        "true",
    }),

    logging: Object.freeze({
      level:
        process.env.LOG_LEVEL ??
        "info",
    }),
  });
}