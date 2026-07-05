import type { KeyObject } from "node:crypto";

import type {
  SignedExecutionAuthorization,
} from "@parmana/shared";

import { SignatureVerifier } from "./SignatureVerifier.js";

import type { CryptoProvider } from "./providers/CryptoProvider.js";

/**
 * Result of verifying a
 * SignedExecutionAuthorization.
 *
 * All checks always run; no early return.
 */
export interface AuthorizationVerificationResult {
  readonly valid: boolean;

  readonly checks: {
    readonly signatureVerified: boolean;
    readonly notExpired: boolean;
  };
}

/**
 * Authorization Verifier.
 *
 * Verifies a SignedExecutionAuthorization.
 * Delegates signature verification to
 * SignatureVerifier over the
 * CanonicalSerializer.
 *
 * NOTE: nonce single-use enforcement is the
 * responsibility of the receiving system's
 * nonce store (Session 3). This class verifies
 * signature and expiry only.
 */
export class AuthorizationVerifier {
  private readonly verifier: SignatureVerifier;

  constructor(
    private readonly crypto: CryptoProvider,
  ) {
    this.verifier = new SignatureVerifier(crypto);
  }

  /**
   * Verifies signature and expiry.
   *
   * Both checks always run — no early return
   * before cryptographic verification, to avoid
   * a timing oracle on the expiry field.
   */
  async verify(
    authorization: SignedExecutionAuthorization,
    publicKey: KeyObject,
    now: Date = new Date(),
  ): Promise<AuthorizationVerificationResult> {
    const signatureVerified =
      await this.verifier.verify(
        authorization.payload,
        authorization.signature,
        publicKey,
      );

    const expiry = Date.parse(
      authorization.payload.expiresAt,
    );

    const notExpired =
      Number.isFinite(expiry) &&
      now.getTime() < expiry;

    return {
      valid: signatureVerified && notExpired,

      checks: {
        signatureVerified,
        notExpired,
      },
    };
  }
}
