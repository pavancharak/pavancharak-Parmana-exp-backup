import type { SettlementConfirmation } from "@parmana/shared";

import { CryptoBootstrap } from "./CryptoBootstrap.js";

import { ReceiptHasher } from "./ReceiptHasher.js";
import { ArtifactSigner } from "./ArtifactSigner.js";
import { TrustRecordHasher } from "./TrustRecordHasher.js";

import { FileKeyProvider } from "./providers/key/FileKeyProvider.js";
import { DEFAULT_KEY_ID } from "./KeyProvider.js";

/**
 * Settlement Confirmation cryptographic operations.
 *
 * Structurally identical to ReceiptCrypto.ts — same composition
 * (TrustRecordHasher + ArtifactSigner + FileKeyProvider +
 * CryptoBootstrap), same canonical-serialize-then-sign discipline, same
 * DEFAULT_KEY_ID — so a Settlement Confirmation is signed exactly the
 * way a Receipt is. A separate class rather than extending ReceiptCrypto
 * itself: ReceiptCrypto.createReceipt() is typed specifically for the
 * Receipt shape, and Receipt-generation code must never be touched by
 * work on a different artifact type (M4b's confirmation never mutates
 * or depends on receipt-service.ts).
 */
export class SettlementConfirmationCrypto {
  private readonly crypto = CryptoBootstrap.create();

  private readonly keys = new FileKeyProvider();

  private readonly trustRecordHasher = new TrustRecordHasher(this.crypto);

  private readonly hasher = new ReceiptHasher(this.trustRecordHasher);

  private readonly signer = new ArtifactSigner(this.crypto);

  /**
   * Computes the canonical confirmation hash.
   */
  async hash(value: unknown): Promise<string> {
    return this.hasher.hash(value);
  }

  /**
   * Signs any canonical object.
   */
  async sign(value: unknown): Promise<string> {
    const privateKey = await this.keys.getPrivateKey(DEFAULT_KEY_ID);

    return this.signer.sign(value, privateKey);
  }

  /**
   * Creates a signed Settlement Confirmation.
   */
  async createConfirmation(
    payload: Omit<SettlementConfirmation, "confirmationHash" | "signature" | "algorithm">,
  ): Promise<SettlementConfirmation> {
    const withoutHash = {
      ...payload,
      algorithm: this.crypto.signature.algorithm,
    };

    const confirmationHash = await this.hash(withoutHash);

    const unsigned = {
      ...withoutHash,
      confirmationHash,
    };

    const signature = await this.sign(unsigned);

    return {
      ...unsigned,
      signature,
    };
  }
}
