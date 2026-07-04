import type {
  ExecutionTrustRecord,
  Signature,
} from "@parmana/shared";

import { CryptoBootstrap } from "./CryptoBootstrap.js";
import { TrustRecordHasher } from "./TrustRecordHasher.js";
import { ArtifactSigner } from "./ArtifactSigner.js";
import { SignatureVerifier } from "./SignatureVerifier.js";
import { FileKeyProvider } from "./providers/key/FileKeyProvider.js";

/**
 * Verification cryptographic operations.
 *
 * Provides hashing, signing and verification
 * services for Execution Trust Records.
 */
export class VerificationCrypto {
  private readonly crypto =
    CryptoBootstrap.create();

  /**
   * File-based key provider.
   */
  private readonly keys =
    new FileKeyProvider();

  private readonly hasher =
    new TrustRecordHasher(this.crypto);

  private readonly signer =
    new ArtifactSigner(this.crypto);

  private readonly verifier =
    new SignatureVerifier(this.crypto);

  /**
   * Creates the canonical immutable view of an
   * Execution Trust Record used for hashing and
   * signing.
   *
   * Mutable lifecycle artifacts are intentionally
   * excluded so the signed content remains stable.
   */
  private canonicalRecord(
    trustRecord: ExecutionTrustRecord,
  ) {
    return {
      trustRecordId:
        trustRecord.trustRecordId,

      businessTransactionId:
        trustRecord.businessTransactionId,

      transaction:
        trustRecord.transaction,

      overrides:
        trustRecord.overrides,

      executions:
        trustRecord.executions,

      createdAt:
        trustRecord.createdAt,
    };
  }

  /**
   * Computes the canonical Trust Record hash.
   */
  async hash(
    trustRecord: ExecutionTrustRecord,
  ): Promise<string> {
    return this.hasher.hash(
      this.canonicalRecord(trustRecord),
    );
  }

  /**
   * Creates a digital signature over the canonical
   * Trust Record.
   */
  async sign(
    trustRecord: ExecutionTrustRecord,
  ): Promise<Signature> {
    const keyId = "default";

    const privateKey =
      await this.keys.getPrivateKey(keyId);

    const value =
      await this.signer.sign(
        this.canonicalRecord(trustRecord),
        privateKey,
      );

    return {
      algorithm:
        this.crypto.signature.algorithm,

      keyId,

      value,

      signedAt: new Date(),
    };
  }

  /**
   * Verifies integrity and authenticity of the
   * Trust Record.
   */
  async verify(
    trustRecord: ExecutionTrustRecord,
  ): Promise<boolean> {
    console.log("[Crypto] verify() start");

    //
    // Verify hash integrity.
    //
    console.time("[Crypto] hash");

    const expectedHash =
      await this.hash(trustRecord);

    console.timeEnd("[Crypto] hash");

    if (
      expectedHash !==
      trustRecord.trustRecordHash
    ) {
      console.log(
        "[Crypto] Hash mismatch",
      );

      console.log(
        "[Crypto] Expected:",
        expectedHash,
      );

      console.log(
        "[Crypto] Actual:",
        trustRecord.trustRecordHash,
      );

      return false;
    }

    console.log(
      "[Crypto] Hash verified",
    );

    //
    // Load public key.
    //
    console.time(
      "[Crypto] getPublicKey",
    );

    const publicKey =
      await this.keys.getPublicKey(
        trustRecord.signature.keyId,
      );

    console.timeEnd(
      "[Crypto] getPublicKey",
    );

    console.log(
      "[Crypto] Public key loaded",
    );

    //
    // Verify signature.
    //
    console.time(
      "[Crypto] verifySignature",
    );

    const verified =
      await this.verifier.verify(
        this.canonicalRecord(
          trustRecord,
        ),
        trustRecord.signature.value,
        publicKey,
      );

    console.timeEnd(
      "[Crypto] verifySignature",
    );

    console.log(
      "[Crypto] Result:",
      verified,
    );

    return verified;
  }
}