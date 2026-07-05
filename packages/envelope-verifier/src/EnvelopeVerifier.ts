import type { KeyObject } from "node:crypto";

import {
  AuthorizationVerifier,
  CryptoBootstrap,
} from "@parmana/crypto";

import type { SignedExecutionAuthorization } from "@parmana/shared";

import type { NonceStore } from "./NonceStore.js";

const DEFAULT_MAX_TTL_SECONDS = 300;

/**
 * Result of the side-effect-free envelope checks:
 * payload version, signature, expiry, and TTL
 * policy. Consuming the nonce is a separate,
 * side-effecting step — see
 * EnvelopeVerifier.consumeNonce.
 */
export interface EnvelopeChecksResult {
  readonly passed: boolean;

  readonly checks: {
    readonly versionSupported: boolean;
    readonly signatureVerified: boolean;
    readonly notExpired: boolean;
    readonly ttlWithinPolicy: boolean;
  };
}

/**
 * Result of verifying an execution authorization
 * envelope.
 *
 * The four side-effect-free checks (version,
 * signature, expiry, TTL policy) always run. The
 * nonce check has a side effect (it consumes the
 * nonce) and runs only when the other four have
 * passed — see EnvelopeVerifier.verify for why.
 */
export interface EnvelopeVerificationResult {
  readonly valid: boolean;

  readonly checks: {
    readonly versionSupported: boolean;
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

  /**
   * Runs every side-effect-free check: payload
   * version, signature, expiry, and TTL policy.
   * Never touches the nonce store, so callers can
   * run this safely before deciding whether the
   * nonce should be consumed at all — for example,
   * a caller that has an additional check of its own
   * (such as a content-hash comparison) to run before
   * the nonce is burned.
   */
  async verifyChecks(
    authorization: SignedExecutionAuthorization,
    now: Date = new Date(),
  ): Promise<EnvelopeChecksResult> {
    const { checks } = await this.authorizationVerifier.verify(
      authorization,
      this.publicKey,
      now,
    );

    const { versionSupported, signatureVerified, notExpired } = checks;

    const ttlSeconds =
      (Date.parse(authorization.payload.expiresAt) -
        Date.parse(authorization.payload.authorizedAt)) /
      1000;

    const ttlWithinPolicy =
      Number.isFinite(ttlSeconds) &&
      ttlSeconds <= this.maxTtlSeconds;

    return {
      passed:
        versionSupported &&
        signatureVerified &&
        notExpired &&
        ttlWithinPolicy,

      checks: {
        versionSupported,
        signatureVerified,
        notExpired,
        ttlWithinPolicy,
      },
    };
  }

  /**
   * Consumes the envelope's nonce against this
   * verifier's NonceStore. This is the only check
   * with a side effect, so it is a separate method
   * from verifyChecks: callers MUST only call this
   * after every side-effect-free check has passed —
   * otherwise a forged or expired envelope could burn
   * the nonce and cause the legitimate request to be
   * rejected (see verify() below for the safe
   * composition).
   */
  async consumeNonce(
    authorization: SignedExecutionAuthorization,
  ): Promise<boolean> {
    return this.nonceStore.checkAndRecord(
      authorization.payload.nonce,
      authorization.payload.expiresAt,
    );
  }

  /**
   * Verifies signature, expiry, and TTL policy, then
   * — only if all three passed — consumes the nonce.
   * This is the safe composition of verifyChecks() and
   * consumeNonce(): a forged or expired envelope must
   * not burn a nonce, otherwise an attacker who
   * observes a nonce in transit could poison it with a
   * forged envelope and cause the legitimate request to
   * be rejected.
   */
  async verify(
    authorization: SignedExecutionAuthorization,
    now: Date = new Date(),
  ): Promise<EnvelopeVerificationResult> {
    const { passed, checks } = await this.verifyChecks(
      authorization,
      now,
    );

    const nonceUnseen = passed
      ? await this.consumeNonce(authorization)
      : false;

    return {
      valid: passed && nonceUnseen,

      checks: {
        ...checks,
        nonceUnseen,
      },
    };
  }
}
