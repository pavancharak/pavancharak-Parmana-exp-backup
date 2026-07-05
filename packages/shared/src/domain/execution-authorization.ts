/**
 * Execution Authorization
 *
 * Proof that Parmana authorized a specific
 * execution request.
 *
 * Enterprise systems should execute only
 * requests carrying a valid, verified
 * SignedExecutionAuthorization.
 *
 * All timestamps are ISO-8601 UTC strings so the
 * artifact serializes identically before signing
 * (Parmana side) and after JSON transport
 * (receiving side). Never use Date objects here.
 */

/**
 * The signed payload.
 *
 * Every field participates in the signature.
 */
export interface ExecutionAuthorizationPayload {
  /**
   * Payload format version.
   *
   * Verifiers MUST reject any value other than 1
   * (including a missing field) before attempting
   * signature verification. There are no external
   * consumers of the prior unversioned format, so
   * this is a breaking change made once, not a
   * migrated one — see docs/CLAIMS.md.
   */
  readonly version: 1;

  /**
   * Unique authorization identifier.
   */
  readonly authorizationId: string;

  /**
   * Single-use nonce.
   *
   * Receiving systems MUST reject an
   * authorization whose nonce has been
   * seen before.
   */
  readonly nonce: string;

  /**
   * Approved Decision.
   */
  readonly decisionId: string;

  /**
   * Business Transaction.
   */
  readonly businessTransactionId: string;

  /**
   * Policy that produced the decision.
   */
  readonly policyName: string;

  /**
   * Policy version that produced the decision.
   */
  readonly policyVersion: string;

  /**
   * ISO-8601 UTC time the authorization
   * was issued.
   */
  readonly authorizedAt: string;

  /**
   * ISO-8601 UTC expiry. REQUIRED.
   *
   * Receiving systems MUST reject an
   * authorization past this time.
   */
  readonly expiresAt: string;

  /**
   * Canonical content hash of the ExecutableContent
   * (businessTransactionId, action, target,
   * parameters) approved for execution.
   *
   * Computed identically by the signing side (from
   * the runtime's in-memory transaction) and the
   * verifying side (from the JSON-parsed request) via
   * the same ExecutableContentHasher, so a receiving
   * gateway can recompute this hash from the exact
   * content it is about to forward and reject any
   * mismatch — closing the gap where a valid envelope
   * could accompany a modified payload carrying the
   * same businessTransactionId.
   */
  readonly businessTransactionHash: string;
}

/**
 * The complete envelope crossing the
 * execution boundary.
 */
export interface SignedExecutionAuthorization {
  /**
   * The signed payload.
   */
  readonly payload: ExecutionAuthorizationPayload;

  /**
   * Signature over the canonical
   * serialization of the payload.
   */
  readonly signature: string;

  /**
   * Identifier of the signing key, so the
   * verifier can select the correct
   * public key.
   */
  readonly keyId: string;

  /**
   * Signature algorithm identifier.
   */
  readonly algorithm: string;
}
