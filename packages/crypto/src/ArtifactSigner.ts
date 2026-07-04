import type { KeyObject } from "node:crypto";

import { CanonicalSerializer } from "./CanonicalSerializer.js";

import type { CryptoProvider } from "./providers/CryptoProvider.js";

/**
 * Artifact Signer.
 *
 * Signs any canonical Parmana artifact using
 * the configured SignatureProvider.
 */
export class ArtifactSigner {
  constructor(
    private readonly crypto: CryptoProvider,

    private readonly serializer =
      new CanonicalSerializer(),
  ) {}

  /**
   * Signs a canonical artifact.
   */
  async sign(
    artifact: unknown,
    privateKey: KeyObject,
  ): Promise<string> {
    const bytes =
      this.serializer.serialize(artifact);

    return this.crypto.signature.sign(
      bytes,
      privateKey,
    );
  }
}