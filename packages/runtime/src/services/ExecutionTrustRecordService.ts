import { createHash, randomUUID } from "crypto";

import {
  BusinessTransaction,
  Execution,
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
  SignatureAlgorithms,
} from "@parmana/shared";

/**
 * Internal draft used while constructing an
 * ExecutionTrustRecord before it is signed.
 */
type TrustRecordDraft = Omit<
  ExecutionTrustRecord,
  "trustRecordHash" | "signature"
>;

export interface ExecutionTrustRecordServiceInput {
  readonly transaction: BusinessTransaction;
  readonly execution: Execution;
}

/**
 * ExecutionTrustRecordService
 *
 * Responsible for:
 * 1. Creating immutable Execution Trust Records
 * 2. Persisting them for replay and verification
 */
export class ExecutionTrustRecordService {
  constructor(
    private readonly repository: ExecutionTrustRecordRepository,
  ) {}

  /**
   * Creates a deterministic ExecutionTrustRecord.
   *
   * NOTE:
   * This currently uses a temporary placeholder
   * signature until VerificationCrypto.sign()
   * is implemented.
   */
  create(
    input: ExecutionTrustRecordServiceInput,
  ): ExecutionTrustRecord {
    const now = new Date();

    const trustRecord: TrustRecordDraft = {
      trustRecordId: randomUUID(),

      businessTransactionId:
        input.transaction.businessTransactionId,

      transaction: input.transaction,

      overrides: [],

      executions: [input.execution],

      verifications: [],

      receipts: [],

      createdAt: now,

      updatedAt: now,
    };

    return {
      ...trustRecord,

      trustRecordHash: this.computeHash(trustRecord),

      // TODO:
      // Replace with VerificationCrypto.sign()
      signature: {
        algorithm: SignatureAlgorithms.ED25519,
        keyId: "default",
        value: "",
        signedAt: now,
      },
    };
  }

  /**
   * Persists an ExecutionTrustRecord.
   */
  async save(
    record: ExecutionTrustRecord,
  ): Promise<void> {
    await this.repository.create(record);
  }

  /**
   * Deterministic hash computation.
   */
  private computeHash(
    record: TrustRecordDraft,
  ): string {
    return createHash("sha256")
      .update(JSON.stringify(record))
      .digest("hex");
  }
}