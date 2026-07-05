import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll } from "vitest";

/**
 * Global hermetic key material.
 *
 * Runs before every test file, in every package, from a bare
 * clone with no env vars set. Generates a fresh Ed25519 keypair
 * into a per-file temp directory and points PARMANA_KEY_DIR at
 * it, so no test depends on the repo-root keys/ directory (which
 * is gitignored and absent on a fresh clone — see Session 3).
 *
 * Individual test files that need specific key material (for
 * example packages/crypto/test/dilithium3-cross-instance.test.ts,
 * which needs ml-dsa-65 keys) still set PARMANA_KEY_DIR themselves
 * in their own beforeEach/afterEach; this only establishes the
 * hermetic default.
 */
const keyDir = mkdtempSync(join(tmpdir(), "parmana-vitest-keys-"));

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

writeFileSync(
  join(keyDir, "default.private.pem"),
  privateKey.export({ format: "pem", type: "pkcs8" }),
);

writeFileSync(
  join(keyDir, "default.public.pem"),
  publicKey.export({ format: "pem", type: "spki" }),
);

process.env.PARMANA_KEY_DIR = keyDir;

afterAll(() => {
  rmSync(keyDir, { recursive: true, force: true });
});
