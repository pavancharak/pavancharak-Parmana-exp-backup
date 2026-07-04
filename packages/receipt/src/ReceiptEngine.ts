import crypto from "node:crypto";

import type { ExecutionTrustRecord } from "@parmana/shared";
import type { Verification } from "@parmana/shared";

export interface Receipt {
  receiptId: string;
  businessTransactionId: string;
  trustRecordHash: string;
  verificationId: string;
  status: "ISSUED" | "FAILED";
  issuedAt: string;
  receiptHash: string;
}

export interface ReceiptContext {
  trustRecord: ExecutionTrustRecord;
  verification: Verification;
}

export class ReceiptEngine {
  public generate(
    context: ReceiptContext,
  ): Receipt {
    const receiptId =
      crypto.randomUUID();

    const payload = {
      receiptId,
      businessTransactionId:
        context.trustRecord.businessTransactionId,
      trustRecordHash:
        context.trustRecord.trustRecordHash,
      verificationId:
        context.verification.verificationId,
      issuedAt:
        new Date().toISOString(),
    };

    const receiptHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");

    return {
      ...payload,
      status: "ISSUED",
      receiptHash,
    };
  }
}