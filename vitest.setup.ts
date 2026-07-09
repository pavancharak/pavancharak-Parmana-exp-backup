import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll } from "vitest";

/**
 * Global hermetic key material.
 *
 * Every test file gets its own temporary Ed25519 keypair.
 * Both the Runtime signer and the Execution Gateway verifier
 * are configured to use this same keypair.
 */
const keyDir = mkdtempSync(
  join(tmpdir(), "parmana-vitest-keys-"),
);

const { privateKey, publicKey } =
  generateKeyPairSync("ed25519");

writeFileSync(
  join(keyDir, "default.private.pem"),
  privateKey.export({
    format: "pem",
    type: "pkcs8",
  }),
);

writeFileSync(
  join(keyDir, "default.public.pem"),
  publicKey.export({
    format: "pem",
    type: "spki",
  }),
);

/**
 * Runtime (FileKeyProvider)
 */
process.env.PARMANA_KEY_DIR = keyDir;

/**
 * Compatibility if loadConfig() uses KEY_DIRECTORY.
 */
process.env.KEY_DIRECTORY = keyDir;

/**
 * Execution Gateway
 */
process.env.PUBLIC_KEY_PATH = join(
  keyDir,
  "default.public.pem",
);

afterAll(() => {
  rmSync(keyDir, {
    recursive: true,
    force: true,
  });
});