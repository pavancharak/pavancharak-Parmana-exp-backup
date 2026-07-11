import {
  ArtifactSigner,
} from "./ArtifactSigner.js";

import type {
  HybridCryptoProvider,
} from "./models/HybridCryptoProvider.js";

import type {
  SignatureBundle,
  SignatureEntry,
} from "./models/SignatureBundle.js";

import type { KeyObject } from "node:crypto";

export class HybridSigner {
  constructor(
    private readonly crypto: HybridCryptoProvider,
  ) {}

  async sign(
    artifact: unknown,
    primaryPrivateKey: KeyObject,
    secondaryPrivateKey: KeyObject,
    primaryKeyId: string,
    secondaryKeyId: string,
  ): Promise<SignatureBundle> {
    const primarySigner =
      new ArtifactSigner(
        this.crypto.primary,
      );

    const secondarySigner =
      new ArtifactSigner(
        this.crypto.secondary,
      );

    const primarySignature =
      await primarySigner.sign(
        artifact,
        primaryPrivateKey,
      );

    const secondarySignature =
      await secondarySigner.sign(
        artifact,
        secondaryPrivateKey,
      );

    const signatures: SignatureEntry[] = [
      {
        algorithm:
          this.crypto.primary.signature.algorithm,
        keyId: primaryKeyId,
        signature: primarySignature,
      },
      {
        algorithm:
          this.crypto.secondary.signature.algorithm,
        keyId: secondaryKeyId,
        signature: secondarySignature,
      },
    ];

    return {
      signatures,
    };
  }
}