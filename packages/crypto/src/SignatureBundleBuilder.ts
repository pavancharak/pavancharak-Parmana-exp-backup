import type {
  SignatureBundle,
  SignatureEntry,
} from "./models/SignatureBundle.js";

/**
 * Builder for SignatureBundle.
 */
export class SignatureBundleBuilder {
  private readonly signatures: SignatureEntry[] =
    [];

  /**
   * Adds a signature.
   */
  add(
    signature: SignatureEntry,
  ): this {
    this.signatures.push(signature);

    return this;
  }

  /**
   * Builds the immutable bundle.
   */
  build(): SignatureBundle {
    if (this.signatures.length === 0) {
      throw new Error(
        "SignatureBundle must contain at least one signature.",
      );
    }

    return Object.freeze({
      signatures: Object.freeze([
        ...this.signatures,
      ]),
    });
  }
}