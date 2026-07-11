import {
  type KeyObject,
} from "node:crypto";

import { CanonicalSerializer } from "./CanonicalSerializer.js";

import type { CryptoProvider } from "./providers/CryptoProvider.js";

/**
 * Artifact Signer.
 */
export class ArtifactSigner {
  constructor(
    private readonly crypto: CryptoProvider,
    private readonly serializer =
      new CanonicalSerializer(),
  ) {}

  async sign(
    artifact: unknown,
    privateKey: KeyObject,
  ): Promise<string> {
    const bytes =
      this.serializer.serialize(artifact);



    const signature =
      await this.crypto.signature.sign(
        bytes,
        privateKey,
      );


    return signature;
  }
}
