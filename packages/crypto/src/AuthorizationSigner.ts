import { randomUUID } from "node:crypto";
import type { KeyObject } from "node:crypto";

import type {
  ExecutionAuthorizationPayload,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import { ArtifactSigner } from "./ArtifactSigner.js";

import type { CryptoProvider } from "./providers/CryptoProvider.js";

/**
 * Authorization Signer.
 *
 * Produces a SignedExecutionAuthorization for an
 * approved decision. Delegates all cryptography to
 * ArtifactSigner over the CanonicalSerializer.
 */
export class AuthorizationSigner {
  private readonly signer: ArtifactSigner;

  constructor(
    private readonly crypto: CryptoProvider,
  ) {
    this.signer = new ArtifactSigner(crypto);
  }

  /**
   * Signs an authorization payload.
   *
   * The caller supplies identity fields; this
   * method supplies nonce, issue time, and
   * expiry, then signs.
   */
  async sign(
    input: {
      readonly decisionId: string;
      readonly businessTransactionId: string;
      readonly policyName: string;
      readonly policyVersion: string;
    },
    privateKey: KeyObject,
    keyId: string,
    ttlSeconds: number,
  ): Promise<SignedExecutionAuthorization> {
    if (ttlSeconds <= 0) {
      throw new Error(
        "Authorization TTL must be positive.",
      );
    }

    const issuedAt = new Date();

    const expiresAt = new Date(
      issuedAt.getTime() + ttlSeconds * 1000,
    );

    const payload: ExecutionAuthorizationPayload = {
      authorizationId: randomUUID(),
      nonce: randomUUID(),
      decisionId: input.decisionId,
      businessTransactionId:
        input.businessTransactionId,
      policyName: input.policyName,
      policyVersion: input.policyVersion,
      authorizedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const signature = await this.signer.sign(
      payload,
      privateKey,
    );

    return {
      payload,
      signature,
      keyId,
      algorithm: this.crypto.signature.algorithm,
    };
  }
}
