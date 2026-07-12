import type {
  ExecutionPermit,
} from "@parmana/execution-control";

import {
  ExecutionTrustAttestation,
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
    trustRecord: ExecutionTrustAttestation,
  ): ExecutionReceipt {
    return Object.freeze({
      version: 1,
      permit,
      trustRecord,
    });
  }
}