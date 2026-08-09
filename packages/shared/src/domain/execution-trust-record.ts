import { BusinessTransaction } from "./business-transaction.js";
import { Execution } from "./execution.js";
import { Override } from "./override.js";
import { Verification } from "./verification.js";
import { Receipt } from "./receipt.js";
import { SettlementConfirmation } from "./settlement-confirmation.js";
import { Signature } from "./signature.js";
import { SignatureEntry } from "./signature-entry.js";

/**
 * Parmana Trust Core
 *
 * Execution Trust Record
 *
 * Canonical immutable record representing everything
 * Parmana knows about a Business Transaction.
 *
 * The Execution Trust Record is the authoritative
 * source for replay, verification, audit, and
 * receipt generation.
 */
export interface ExecutionTrustRecord {
  /**
   * Unique Execution Trust Record identifier.
   */
  readonly trustRecordId: string;

  /**
   * Business Transaction identifier.
   */
  readonly businessTransactionId: string;

  /**
   * Canonical Business Transaction.
   */
  readonly transaction: BusinessTransaction;

  /**
   * Optional Override history.
   *
   * Business rules currently allow a single accepted
   * Override, but the history is modeled as an array
   * to preserve append-only evolution.
   */
  readonly overrides: readonly Override[];

  /**
   * Execution history.
   *
   * Multiple Executions may exist for long-running
   * workflows, retries, or future execution models.
   */
  readonly executions: readonly Execution[];

  /**
   * Verification history.
   *
   * Every verification produces a new immutable
   * Verification artifact.
   */
  readonly verifications: readonly Verification[];

  /**
   * Receipt history.
   *
   * Receipts are immutable cryptographic attestations
   * of Execution Trust Record state.
   */
  readonly receipts: readonly Receipt[];

  /**
   * Settlement Confirmation history.
   *
   * Optional (unlike receipts/verifications/overrides) rather than
   * defaulted to an empty array at every construction site: this field
   * did not exist before M4b, and making it optional means every
   * pre-existing call site that builds an ExecutionTrustRecord object
   * literal (test fixtures included) keeps compiling unchanged. Readers
   * MUST treat an absent array the same as an empty one.
   *
   * Each entry is a second, independently signed artifact closing a
   * connector-mediated action's lifecycle (e.g. a Razorpay refund) once
   * fetch-verified — see settlement-confirmation.ts. Appending one never
   * mutates any existing Receipt or this record's own
   * trustRecordHash/signature.
   */
  readonly settlementConfirmations?: readonly SettlementConfirmation[];

  /**
   * Canonical hash of the Execution Trust Record.
   *
   * Computed over the canonical serialized form of
   * this aggregate.
   */
  readonly trustRecordHash: string;

  /**
   * Cryptographic signature over the canonical
   * Execution Trust Record.
   *
   * This proves the Trust Record was produced by
   * Parmana and has not been modified since signing.
   */
  readonly signature: Signature;

  /**
   * Envelope schema version (Hybrid Signature Support milestone,
   * Phase A). Absent means schema v1: exactly today's shape,
   * `signature` is the sole cryptographic attestation. Present and
   * >= 2 means `signatures` (below) was populated at signing time and
   * MUST be independently verified in full -- see
   * HybridSignatureProvider (@parmana/crypto). Optional rather than
   * defaulted so every pre-existing construction site (including
   * historical records already in storage) keeps compiling and
   * verifying unchanged; readers MUST treat an absent value as v1.
   */
  readonly schemaVersion?: number;

  /**
   * Additional signatures over this record, one per algorithm,
   * produced only when CRYPTO_MODE=hybrid was active at signing time.
   * `signature` above remains the authoritative single-algorithm
   * attestation (unchanged, always present); this array is additive
   * proof that a second, independent algorithm also signed the same
   * content. A verifier that finds this array non-empty MUST require
   * every entry to verify -- a missing or malformed entry is a
   * rejection, never a silent fallback to `signature` alone.
   */
  readonly signatures?: readonly SignatureEntry[];

  /**
   * UTC timestamp when the Execution Trust Record
   * was first created.
   */
  readonly createdAt: Date;

  /**
   * UTC timestamp when the Execution Trust Record
   * was last extended with a new immutable artifact.
   */
  readonly updatedAt: Date;
}
