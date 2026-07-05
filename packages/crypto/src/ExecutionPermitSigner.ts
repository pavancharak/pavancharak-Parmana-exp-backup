import { randomUUID } from "node:crypto";
import type { KeyObject } from "node:crypto";

import type {
  ExecutionPermit,
  SignedExecutionPermit,
} from "@parmana/shared";

import { ArtifactSigner } from "./ArtifactSigner.js";
import type { CryptoProvider } from "./providers/CryptoProvider.js";

/**
 * Execution Permit Signer.
 *
 * Produces a signed Execution Permit.
 *
 * The Runtime constructs the permit.
 * This class is responsible only for
 * cryptographic signing.
 */
export class ExecutionPermitSigner {
  private readonly signer: ArtifactSigner;

  constructor(
    private readonly crypto: CryptoProvider,
  ) {
    this.signer =
      new ArtifactSigner(crypto);
  }

  /**
   * Sign an Execution Permit.
   */
  async sign(
    input: {
      readonly authorizationId: string;
      readonly businessTransactionId: string;
      readonly transactionHash: string;
      readonly expiresAt: string;
    },
    privateKey: KeyObject,
    keyId: string,
  ): Promise<SignedExecutionPermit> {
    const payload: ExecutionPermit = {
      permitId: randomUUID(),

      authorizationId:
        input.authorizationId,

      businessTransactionId:
        input.businessTransactionId,

      transactionHash:
        input.transactionHash,

      /**
       * Hash algorithm used to produce
       * transactionHash.
       *
       * TODO:
       * Replace this constant with the
       * configured HashProvider once
       * cryptographic agility is wired
       * throughout the Runtime.
       */
      hashAlgorithm:
        "sha256",

      issuedAt:
        new Date().toISOString(),

      expiresAt:
        input.expiresAt,
    };

    const signature =
      await this.signer.sign(
        payload,
        privateKey,
      );

    return {
      payload,
      signature,
      keyId,
      algorithm:
        this.crypto.signature.algorithm,
    };
  }
}