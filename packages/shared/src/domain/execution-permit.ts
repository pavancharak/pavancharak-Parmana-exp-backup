/**
 * Execution Permit
 *
 * A cryptographically signed permit that
 * authorizes one immutable Business
 * Transaction for execution.
 *
 * The permit is algorithm-agnostic and is
 * designed for cryptographic agility.
 *
 * Enterprise execution systems MUST reject
 * any execution request whose computed
 * transaction hash differs from this permit.
 */



/**
 * Execution Permit payload.
 */
export interface ExecutionPermit {

  /**
   * Unique permit identifier.
   */
  readonly permitId: string;

  /**
   * Execution Authorization that
   * produced this permit.
   */
  readonly authorizationId: string;

  /**
   * Immutable Business Transaction.
   */
  readonly businessTransactionId: string;

  /**
   * Canonical transaction hash.
   */
  readonly transactionHash: string;

  /**
   * Hash algorithm used to compute
   * transactionHash.
   */
  /**
 * Hash algorithm used to compute the
 * transaction hash.
 *
 * Examples:
 * - sha256
 * - sha384
 * - sha3-256
 * - blake3
 */
readonly hashAlgorithm: string;

  /**
   * UTC issue time.
   */
  readonly issuedAt: string;

  /**
   * UTC expiry.
   */
  readonly expiresAt: string;
}

/**
 * Signed Execution Permit.
 *
 * The payload is signed using the configured
 * Signature Provider.
 *
 * Examples:
 *
 * - ed25519
 * - ml-dsa-65
 * - ml-dsa-87
 * - dual-ed25519-ml-dsa-65
 */
export interface SignedExecutionPermit {

  /**
   * Signed payload.
   */
  readonly payload: ExecutionPermit;

  /**
   * Digital signature.
   */
  readonly signature: string;

  /**
   * Signing key identifier.
   */
  readonly keyId: string;

  /**
   * Signature algorithm.
   *
   * The verifier MUST select the appropriate
   * verification provider based on this value.
   */
  readonly algorithm: string;
}