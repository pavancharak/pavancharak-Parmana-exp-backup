import { describe, expect, it } from "vitest";

import { FileKeyProvider } from "../../src/providers/key/FileKeyProvider.js";
import { CryptoError } from "../../src/errors/CryptoError.js";

/**
 * PARMANA_KEY_DIR is set to a fresh temp directory containing a real
 * "default" keypair by the global vitest.setup.ts before this file runs.
 */
describe("FileKeyProvider keyId sanitization", () => {
  const TRAVERSAL_KEY_ID = "../../../../etc/passwd";

  it("rejects a path-traversal keyId in getPrivateKey before touching the filesystem", async () => {
    const provider = new FileKeyProvider();

    await expect(
      provider.getPrivateKey(TRAVERSAL_KEY_ID),
    ).rejects.toThrow(CryptoError);

    await expect(
      provider.getPrivateKey(TRAVERSAL_KEY_ID),
    ).rejects.toThrow(/Invalid keyId/);
  });

  it("rejects a path-traversal keyId in getPublicKey", async () => {
    const provider = new FileKeyProvider();

    await expect(
      provider.getPublicKey(TRAVERSAL_KEY_ID),
    ).rejects.toThrow(/Invalid keyId/);
  });

  it("rejects a path-traversal keyId in hasKey", async () => {
    const provider = new FileKeyProvider();

    await expect(provider.hasKey(TRAVERSAL_KEY_ID)).rejects.toThrow(
      /Invalid keyId/,
    );
  });

  it("rejects a path-traversal keyId in getMetadata", async () => {
    const provider = new FileKeyProvider();

    await expect(
      provider.getMetadata(TRAVERSAL_KEY_ID),
    ).rejects.toThrow(/Invalid keyId/);
  });

  it("accepts the well-formed keyId used by the rest of the suite", async () => {
    const provider = new FileKeyProvider();

    expect(await provider.hasKey("default")).toBe(true);
  });
});
