import type {
  SignedExecutionAuthorization,
} from "@parmana/shared";

/**
 * Canonical request sent by Parmana to an
 * Execution System.
 *
 * Produced only after successful authorization.
 */
export interface ExecutionRequest {
  /**
   * Business Transaction identifier.
   */
  readonly businessTransactionId: string;

  /**
   * Approved action.
   */
  readonly action: string;

  /**
   * Approved target.
   */
  readonly target: string;

  /**
   * Approved parameters.
   */
  readonly parameters: Readonly<Record<string, unknown>>;

  /**
   * Proof that Parmana authorized this execution.
   *
   * Receiving systems MUST verify this signature
   * and its expiry before executing.
   */
  readonly authorization: SignedExecutionAuthorization;
}