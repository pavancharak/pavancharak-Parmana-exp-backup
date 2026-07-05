import type { KeyObject } from "node:crypto";

import {
  AuthorizationVerifier,
  CryptoBootstrap,
} from "@parmana/crypto";

import type { SignedExecutionAuthorization } from "@parmana/shared";

import type { NonceStore } from "./NonceStore.js";

const DEFAULT_MAX_TTL_SECONDS = 300;

/**
 * Result of verifying an execution authorization
 * envelope.
 *
 * The three side-effect-free checks (signature,
 * expiry, TTL policy) always run. The nonce check
 * has a side effect (it consumes the nonce) and
 * runs only when the other three have passed — see
 * EnvelopeVerifier.verify for why.
 */
export interface EnvelopeVerificationResult {
  readonly valid: boolean;

  readonly checks: {
    readonly signatureVerified: boolean;
    readonly notExpired: boolean;
    readonly ttlWithinPolicy: boolean;
    readonly nonceUnseen: boolean;
  };
}

export interface EnvelopeVerifierOptions {
  /**
   * Parmana's public key, supplied by the caller.
   * This package never reads key material from
   * disk or the network.
   */
  readonly publicKey: KeyObject;

  readonly nonceStore: NonceStore;

  /**
   * Reject envelopes whose (expiresAt - authorizedAt)
   * exceeds this, so a compromised signer cannot mint
   * long-lived envelopes. Defaults to 300 seconds.
   */
  readonly maxTtlSeconds?: number;
}

/**
 * Envelope Verifier.
 *
 * Verifies that an incoming execution request was
 * authorized by Parmana: valid signature, not
 * expired, issued with a TTL within policy, and not
 * previously accepted by this nonce store.
 *
 * This does not evaluate policy. It proves only that
 * Parmana authorized the request; see the package
 * README for the exact claims a passing verification
 * establishes.
 */
export class EnvelopeVerifier {
  private readonly publicKey: KeyObject;

  private readonly nonceStore: NonceStore;

  private readonly maxTtlSeconds: number;

  private readonly authorizationVerifier: AuthorizationVerifier;

  constructor(options: EnvelopeVerifierOptions) {
    this.publicKey = options.publicKey;
    this.nonceStore = options.nonceStore;
    this.maxTtlSeconds =
      options.maxTtlSeconds ?? DEFAULT_MAX_TTL_SECONDS;

    this.authorizationVerifier = new AuthorizationVerifier(
      CryptoBootstrap.create(),
    );
  }

  async verify(
    authorization: SignedExecutionAuthorization,
    now: Date = new Date(),
  ): Promise<EnvelopeVerificationResult> {
    const { checks } = await this.authorizationVerifier.verify(
      authorization,
      this.publicKey,
      now,
    );

    const { signatureVerified, notExpired } = checks;

    const ttlSeconds =
      (Date.parse(authorization.payload.expiresAt) -
        Date.parse(authorization.payload.authorizedAt)) /
      1000;

    const ttlWithinPolicy =
      Number.isFinite(ttlSeconds) &&
      ttlSeconds <= this.maxTtlSeconds;

    const priorChecksPassed =
      signatureVerified && notExpired && ttlWithinPolicy;

    //
    // The nonce check is the only check with a side
    // effect (it consumes the nonce), so it runs last
    // and only if every side-effect-free check passed.
    // A forged or expired envelope must not burn a
    // nonce: otherwise an attacker who observes a nonce
    // in transit could poison it with a forged envelope
    // and cause the legitimate request to be rejected.
    //
    const nonceUnseen = priorChecksPassed
      ? await this.nonceStore.checkAndRecord(
          authorization.payload.nonce,
          authorization.payload.expiresAt,
        )
      : false;

    return {
      valid: priorChecksPassed && nonceUnseen,

      checks: {
        signatureVerified,
        notExpired,
        ttlWithinPolicy,
        nonceUnseen,
      },
    };
  }
}
