import type { BusinessTransaction } from "./business-transaction.js";
import type { Execution } from "./execution.js";
import type { Override } from "./override.js";
import type { Receipt } from "./receipt.js";
import type { SettlementConfirmation } from "./settlement-confirmation.js";
import type { Signature } from "./signature.js";
import type { Verification } from "./verification.js";

export interface ExecutionTrustRecord {
  readonly trustRecordId: string;
  readonly businessTransactionId: string;
  readonly transaction: BusinessTransaction;
  readonly overrides: Override[];
  readonly executions: Execution[];
  readonly verifications: Verification[];
  readonly receipts: Receipt[];
  /**
   * Settlement Confirmation history (M4b). Optional, unlike the other
   * arrays here: absent on any Trust Record created before M4b, or on
   * one no webhook has ever closed the lifecycle for. Absent means the
   * same thing as empty.
   */
  readonly settlementConfirmations?: SettlementConfirmation[];
  readonly trustRecordHash: string;
  readonly signature: Signature;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}