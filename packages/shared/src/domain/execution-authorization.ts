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
