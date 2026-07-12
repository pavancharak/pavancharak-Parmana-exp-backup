import type {
  ExecutionPermit,
} from "@parmana/execution-control";
import {
  ExecutionTrustAttestation,
} from "@parmana/execution-system";

/**
 * Portable proof of execution.
 */
export interface ExecutionReceipt {
  readonly version: number;

  readonly permit: ExecutionPermit;

  readonly trustRecord: ExecutionTrustAttestation;
}