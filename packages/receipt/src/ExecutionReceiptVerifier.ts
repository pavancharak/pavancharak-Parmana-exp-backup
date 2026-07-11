import type {
  ExecutionReceipt,
} from "./models/ExecutionReceipt.js";

/**
 * Verifies an Execution Receipt.
 *
 * This implementation performs structural
 * verification. Cryptographic verification
 * will be added in a later tutorial.
 */
export class ExecutionReceiptVerifier {
  verify(
    receipt: ExecutionReceipt,
  ): boolean {
    return (
      receipt.version === 1 &&
      receipt.permit !== undefined &&
      receipt.trustRecord !== undefined
    );
  }
}