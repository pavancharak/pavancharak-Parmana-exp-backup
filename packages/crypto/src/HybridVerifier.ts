import { SignatureVerifier } from "./SignatureVerifier.js";

import type { HybridCryptoProvider } from "./models/HybridCryptoProvider.js";
import type { SignatureBundle } from "./models/SignatureBundle.js";

import type { KeyObject } from "node:crypto";

export class HybridVerifier {
  constructor(
    private readonly crypto: HybridCryptoProvider,
  ) {}

  async verify(
    artifact: unknown,
    bundle: SignatureBundle,
    primaryPublicKey: KeyObject,
    secondaryPublicKey: KeyObject,
  ): Promise<boolean> {
    if (bundle.signatures.length !== 2) {
      return false;
    }

    const primaryVerifier =
      new SignatureVerifier(
        this.crypto.primary,
      );

    const secondaryVerifier =
      new SignatureVerifier(
        this.crypto.secondary,
      );

const [
  primarySignature,
  secondarySignature,
] = bundle.signatures;

if (
  !primarySignature ||
  !secondarySignature
) {
  return false;
}

const primaryVerified =
  await primaryVerifier.verify(
    artifact,
    primarySignature.signature,
    primaryPublicKey,
  );

const secondaryVerified =
  await secondaryVerifier.verify(
    artifact,
    secondarySignature.signature,
    secondaryPublicKey,
  );

    return (
      primaryVerified &&
      secondaryVerified
    );
  }
}