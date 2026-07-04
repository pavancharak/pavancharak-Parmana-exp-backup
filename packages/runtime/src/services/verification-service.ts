import crypto from "node:crypto";

import {
  ExecutionTrustRecordRepository,
  Verification,
  VerificationStatus,
} from "@parmana/shared";

import { VerificationFailedError } from "../errors/VerificationFailedError.js";

import { VerificationCrypto } from "@parmana/crypto";

/**
 * Application service responsible for verifying
 * Execution Trust Records.
 *
 * Verification is deterministic and validates
 * the complete Execution Trust Record.
 */
export class VerificationService {
  private readonly crypto =
    new VerificationCrypto();

  constructor(
    private readonly trustRecords: ExecutionTrustRecordRepository,
  ) {}

  /**
   * Verifies an Execution Trust Record.
   */
  async verify(
    businessTransactionId: string,
  ): Promise<Verification> {

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

    const verification: Verification = {
      verificationId:
        crypto.randomUUID(),

      businessTransactionId,

      status: verified
        ? VerificationStatus.VERIFIED
        : VerificationStatus.FAILED,

      message: verified
        ? "Execution Trust Record verified successfully."
        : "Execution Trust Record verification failed.",

      verifiedAt: new Date(),

      trustRecordHash:
        trustRecord.trustRecordHash,
    };

    await this.trustRecords.appendVerification(
      businessTransactionId,
      verification,
    );

    return verification;
  }
}