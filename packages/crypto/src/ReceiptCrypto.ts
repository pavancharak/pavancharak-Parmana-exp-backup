import { loadConfig } from "@parmana/shared";
import type { Receipt } from "@parmana/shared";

import { CryptoBootstrap } from "./CryptoBootstrap.js";
import { HybridSignatureProvider } from "./HybridSignatureProvider.js";

import { ReceiptHasher } from "./ReceiptHasher.js";
import { ArtifactSigner } from "./ArtifactSigner.js";
import { TrustRecordHasher } from "./TrustRecordHasher.js";

import { FileKeyProvider } from "./providers/key/FileKeyProvider.js";
import { DEFAULT_KEY_ID, DEFAULT_SECONDARY_KEY_ID } from "./KeyProvider.js";

/**
 * Schema version stamped on `signatures`-bearing Receipts. See the
 * identical constant/rationale in VerificationCrypto.
 */
const HYBRID_SCHEMA_VERSION = 2;

/**
 * Receipt cryptographic operations.
 *
 * Owns all receipt-related cryptographic
 * operations for Parmana.
 */
export class ReceiptCrypto {
  private readonly crypto = CryptoBootstrap.create();

  private readonly config = loadConfig();

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
   * The legacy `signature`/`algorithm` are unchanged by hybrid mode:
   * always signed by the configured primary provider alone, over
   * exactly the same content as before this milestone (Hybrid
   * Signature Support, Phase A). When CRYPTO_MODE=hybrid, an
   * additional `signatures` array and `schemaVersion` are populated
   * alongside them -- additive, never replacing the legacy fields.
   */
  async createReceipt(
    payload: Omit<
      Receipt,
      "signature" | "algorithm" | "schemaVersion" | "signatures"
    >,
  ): Promise<Receipt> {
    const unsignedReceipt = {
      ...payload,

      algorithm:
        this.crypto.signature.algorithm,
    };

    const signature =
      await this.sign(unsignedReceipt);

    if (this.config.crypto.mode !== "hybrid") {
      return {
        ...unsignedReceipt,

        signature,
      };
    }

    const signatures =
      await new HybridSignatureProvider(
        CryptoBootstrap.createHybrid(),
        this.keys,
      ).sign(
        {
          ...unsignedReceipt,

          schemaVersion: HYBRID_SCHEMA_VERSION,
        },
        DEFAULT_KEY_ID,
        DEFAULT_SECONDARY_KEY_ID,
      );

    return {
      ...unsignedReceipt,

      signature,

      schemaVersion: HYBRID_SCHEMA_VERSION,

      signatures,
    };
  }
}
