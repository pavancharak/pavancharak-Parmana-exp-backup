import {
  createPublicKey,
  type KeyObject,
} from "node:crypto";

import { readFileSync } from "node:fs";

import { loadConfig } from "@parmana/shared";

/**
 * Loads the gateway verification public key.
 */
export function createGatewayPublicKey(): KeyObject {
  const config = loadConfig();

  if (!config.keys.publicKeyPath) {
    throw new Error(
      "PUBLIC_KEY_PATH is not configured.",
    );
  }

  const pem = readFileSync(
    config.keys.publicKeyPath,
    "utf8",
  );

  return createPublicKey(pem);
}