import {
  BusinessTransaction,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import {
  ExecutionRequest,
} from "@parmana/execution-system";

/**
 * Builds the canonical ExecutionRequest forwarded
 * to the configured Execution System.
 */
export class ExecutionRequestBuilder {
  /**
   * Builds an ExecutionRequest from an approved
   * BusinessTransaction and its Signed Execution
   * Authorization.
   */
  public build(
    transaction: BusinessTransaction,
    authorization: SignedExecutionAuthorization,
  ): ExecutionRequest {
    return {
      businessTransactionId:
        transaction.businessTransactionId,

      action:
        transaction.intent.action,

      target:
        transaction.intent.target,

      parameters:
        transaction.intent.parameters,

      authorization,
    };
  }
}