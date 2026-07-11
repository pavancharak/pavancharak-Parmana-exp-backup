import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";

import {
  existsSync,
  readFileSync,
} from "node:fs";

import { join } from "node:path";

import { loadConfig } from "@parmana/shared";

const DEFAULT_GATEWAY_KEY_ID = "gateway";

export interface GatewayKeyPair {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
}

/**
 * Loads the Gateway's attestation-signing keypair.
 *
 * Deliberately separate from the authorization-verification key
 * (createGatewayPublicKey.ts's "default" keyId): different trust
 * domain, and keeping the blast radius of a future compromise scoped to
 * one key at a time. Mirrors createGatewayPublicKey.ts's synchronous
 * read exactly — generates nothing; if either file is absent, throws a
 * clear error naming the missing path.
 */
export function createGatewayKeyPair(): GatewayKeyPair {
  const config = loadConfig();

  if (!config.keys.keyDirectory) {
    throw new Error(
      "PARMANA_KEY_DIR is not configured.",
    );
  }

  const keyId =
    process.env.PARMANA_GATEWAY_KEY_ID ?? DEFAULT_GATEWAY_KEY_ID;

  const privateKeyPath = join(
    config.keys.keyDirectory,
    `${keyId}.private.pem`,
  );

  const publicKeyPath = join(
    config.keys.keyDirectory,
    `${keyId}.public.pem`,
  );

  if (!existsSync(privateKeyPath)) {
    throw new Error(
      `Gateway private key not found: ${privateKeyPath}. Generate it before starting the ` +
        `Gateway — no key is generated automatically.`,
    );
  }

  if (!existsSync(publicKeyPath)) {
    throw new Error(
      `Gateway public key not found: ${publicKeyPath}. Generate it before starting the ` +
        `Gateway — no key is generated automatically.`,
    );
  }

  const privateKey = createPrivateKey(
    readFileSync(privateKeyPath, "utf8"),
  );

  const publicKey = createPublicKey(
    readFileSync(publicKeyPath, "utf8"),
  );

  return { privateKey, publicKey };
}
