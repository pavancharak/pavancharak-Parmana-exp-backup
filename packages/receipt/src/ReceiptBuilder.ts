import { ReceiptEngine } from "./ReceiptEngine.js";

/**
 * Builder for ReceiptEngine
 * (keeps consistency with RuntimeBuilder, VerificationBuilder, etc.)
 */
export class ReceiptBuilder {
  public build(): ReceiptEngine {
    return new ReceiptEngine();
  }
}