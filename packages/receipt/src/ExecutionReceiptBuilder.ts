import type {
  ExecutionPermit,
} from "@parmana/execution-control";

import type {
  ExecutionTrustRecord,
} from "@parmana/execution-system";

import type {
  ExecutionReceipt,
} from "./models/ExecutionReceipt.js";

/**
 * Builds immutable Execution Receipts.
 */
export class ExecutionReceiptBuilder {
  build(
    permit: ExecutionPermit,
    trustRecord: ExecutionTrustRecord,
  ): ExecutionReceipt {
    return Object.freeze({
      version: 1,
      permit,
      trustRecord,
    });
  }
}