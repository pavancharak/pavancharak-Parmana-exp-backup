import type { Receipt } from "@parmana/shared";

import { CryptoBootstrap } from "./CryptoBootstrap.js";

import { ReceiptHasher } from "./ReceiptHasher.js";
import { ArtifactSigner } from "./ArtifactSigner.js";
import { TrustRecordHasher } from "./TrustRecordHasher.js";

import { FileKeyProvider } from "./providers/key/FileKeyProvider.js";
import { DEFAULT_KEY_ID } from "./KeyProvider.js";

/**
 * Receipt cryptographic operations.
 *
 * Owns all receipt-related cryptographic
 * operations for Parmana.
 */
export class ReceiptCrypto {
  private readonly crypto = CryptoBootstrap.create();

  /**
   * Temporary filesystem key provider.
   *
   * Will later be supplied by the crypto
   * composition root.
   */
  private readonly keys = new FileKeyProvider();

  private readonly trustRecordHasher =
    new TrustRecordHasher(this.crypto);

  private readonly receiptHasher =
    new ReceiptHasher(this.trustRecordHasher);

  private readonly signer =
    new ArtifactSigner(this.crypto);

  /**
   * Computes the canonical receipt hash.
   */
  async hash(
    trustRecord: unknown,
  ): Promise<string> {
    return this.receiptHasher.hash(
      trustRecord,
    );
  }

  /**
   * Signs any canonical object.
   */
  async sign(
    value: unknown,
  ): Promise<string> {
    //
    // Temporary development key.
    //
    const privateKey =
      await this.keys.getPrivateKey(DEFAULT_KEY_ID);

    return this.signer.sign(
      value,
      privateKey,
    );
  }

  /**
   * Creates a signed Receipt.
   *
   * The signing algorithm is determined by
   * the configured SignatureProvider.
   */
  async createReceipt(
    payload: Omit<
      Receipt,
      "signature" | "algorithm"
    >,
  ): Promise<Receipt> {
    const unsignedReceipt = {
      ...payload,

      algorithm:
        this.crypto.signature.algorithm,
    };

    const signature =
      await this.sign(unsignedReceipt);

    return {
      ...unsignedReceipt,

      signature,
    };
  }
}