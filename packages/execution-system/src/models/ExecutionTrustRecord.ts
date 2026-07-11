import type {
  SignatureBundle,
} from "@parmana/crypto";

/**
 * Cryptographic proof that an execution
 * was authorized.
 */
export interface ExecutionTrustRecord {
  /**
   * Hash of the canonical artifact.
   */
  readonly artifactHash: string;

  /**
   * One or more cryptographic signatures.
   */
  readonly signatures: SignatureBundle;

  /**
   * Gateway that produced the record.
   */
  readonly gatewayId: string;

  /**
   * Policy version used.
   */
  readonly policyVersion: string;

  /**
   * UTC timestamp.
   */
  readonly timestamp: string;
}