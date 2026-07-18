import { VerificationCrypto } from "@parmana/crypto";

import {
  BusinessTransaction,
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
  Receipt,
  Verification,
} from "@parmana/shared";

import { Runtime } from "./Runtime.js";

import { VerificationFailedError } from "./errors/VerificationFailedError.js";
import { BusinessTransactionService } from "./services/business-transaction-service.js";
import { ReceiptService } from "./services/receipt-service.js";
import { VerificationService } from "./services/verification-service.js";

/**
 * Execution Trust Application.
 *
 * Orchestrates the complete lifecycle:
 *
 * Business Transaction
 *        ↓
 * Runtime
 *        ↓
 * Verification
 *        ↓
 * Receipt
 *        ↓
 * Replay
 */
export class ExecutionTrustApplication {
  private readonly crypto =
    new VerificationCrypto();

  constructor(
    private readonly transactions: BusinessTransactionService,
    private readonly runtime: Runtime,
    private readonly verification: VerificationService,
    private readonly receipts: ReceiptService,
    private readonly trustRecords: ExecutionTrustRecordRepository,
  ) {
    Object.freeze(this);
  }

  /**
   * Execute Business Transaction through the
   * complete Execution Trust pipeline.
   */
  async execute(
    transaction: BusinessTransaction,
  ): Promise<ExecutionTrustRecord> {

    console.log("[APP] 1 - accept");
    await this.transactions.accept(
      transaction,
    );

    console.log("[APP] 2 - runtime");
    await this.runtime.execute(
      transaction,
    );

    console.log("[APP] 3 - verification");
    await this.verification.verify(
      transaction.businessTransactionId,
    );

    console.log("[APP] 4 - receipt");
    await this.receipts.generate(
      transaction.businessTransactionId,
    );

    console.log("[APP] 5 - load trust record");
    const trustRecord =
      await this.trustRecords.findByTransactionId(
        transaction.businessTransactionId,
      );

    console.log("[APP] 6 - found trust record");

    if (!trustRecord) {
      throw new Error(
        "Execution Trust Record not found.",
      );
    }

    console.log("[APP] 7 - returning");
    return trustRecord;
  }

  /**
   * Verify an Execution Trust Record.
   */
  async verify(
    businessTransactionId: string,
  ): Promise<Verification> {
    return this.verification.verify(
      businessTransactionId,
    );
  }

  /**
   * Generate a Receipt.
   */
  async generateReceipt(
    businessTransactionId: string,
  ): Promise<Receipt> {
    return this.receipts.generate(
      businessTransactionId,
    );
  }

  /**
   * Replay execution deterministically.
   */
  async replay(
    businessTransactionId: string,
  ): Promise<{
    businessTransactionId: string;
    trustRecordHash: string;
    verified: boolean;
  }> {
    const trustRecord =
      await this.trustRecords.findByTransactionId(
        businessTransactionId,
      );

    if (!trustRecord) {
      throw new VerificationFailedError(
        "Execution Trust Record not found.",
      );
    }

    const verified =
      await this.crypto.verify(
        trustRecord,
      );

    return {
      businessTransactionId,
      trustRecordHash:
        trustRecord.trustRecordHash,
      verified,
    };
  }

  /**
   * Get Trust Record.
   */
  async getTrustRecord(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord | null> {
    return this.trustRecords.findByTransactionId(
      businessTransactionId,
    );
  }

  /**
   * Get Business Transaction.
   */
  async getTransaction(
    businessTransactionId: string,
  ): Promise<BusinessTransaction | null> {
    return this.transactions.get(
      businessTransactionId,
    );
  }

  /**
   * List Business Transactions.
   */
  async listTransactions(
    page = 1,
    pageSize = 25,
  ): Promise<
    readonly BusinessTransaction[]
  > {
    return this.transactions.list(
      page,
      pageSize,
    );
  }
}