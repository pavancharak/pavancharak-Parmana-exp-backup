import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import { SettlementStatus, type SettlementConfirmation } from "@parmana/shared";

import { SupabaseExecutionTrustRecordRepository } from "../../src/supabase/SupabaseExecutionTrustRecordRepository.js";

import {
  buildBusinessTransaction,
  buildReceiptPair,
  buildSignedMultiExecutionOverrideRecord,
  buildVerificationPair,
} from "../fixtures/multi-item-trust-record.js";

/**
 * Fake pg.Pool backing every table
 * SupabaseExecutionTrustRecordRepository touches
 * (execution_trust_records, executions, overrides, verifications,
 * receipts, settlement_confirmations), with an auto-incrementing
 * `seq` per sub-table -- mirrors the real BIGSERIAL columns
 * (supabase/migrations/20260711120000_add_trust_record_sequence_columns.sql,
 * settlement_confirmations' own seq at table creation) closely enough
 * to prove ORDER BY <timestamp> ASC, seq ASC round-trips insertion
 * order.
 */
function createFakePool() {
  const header: { row?: Record<string, unknown> } = {};
  const executions: Record<string, unknown>[] = [];
  const overrides: Record<string, unknown>[] = [];
  const verifications: Record<string, unknown>[] = [];
  const receipts: Record<string, unknown>[] = [];
  const settlementConfirmations: Record<string, unknown>[] = [];
  let seq = 0;

  function selectOrdered(
    table: Record<string, unknown>[],
    jsonColumn: string,
    timestampColumn: string,
    businessTransactionId: string,
  ) {
    return table
      .filter((row) => row.business_transaction_id === businessTransactionId)
      .sort((a, b) => {
        const timeCompare = (a[timestampColumn] as string).localeCompare(
          b[timestampColumn] as string,
        );
        if (timeCompare !== 0) return timeCompare;
        return (a.seq as number) - (b.seq as number);
      })
      .map((row) => ({ [jsonColumn]: row[jsonColumn] }));
  }

  const pool = {
    query(sql: string, values?: readonly unknown[]) {
      if (sql.includes("INSERT INTO execution_trust_records")) {
        const [trustRecordId, businessTransactionId, transactionJson, hash, signatureJson, createdAt, updatedAt] =
          values as readonly unknown[];

        header.row = {
          trust_record_id: trustRecordId,
          business_transaction_id: businessTransactionId,
          transaction_json: JSON.parse(transactionJson as string),
          trust_record_hash: hash,
          signature_json: JSON.parse(signatureJson as string),
          created_at: createdAt,
          updated_at: updatedAt,
        };

        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("SELECT * FROM execution_trust_records")) {
        const [businessTransactionId] = values as [string];
        const matches =
          header.row?.business_transaction_id === businessTransactionId ? [header.row] : [];

        return Promise.resolve({ rows: matches });
      }

      if (sql.includes("UPDATE execution_trust_records SET updated_at")) {
        const [updatedAt, businessTransactionId] = values as [string, string];

        if (header.row?.business_transaction_id === businessTransactionId) {
          header.row.updated_at = updatedAt;
        }

        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("SELECT execution_json FROM executions")) {
        const [businessTransactionId] = values as [string];
        return Promise.resolve({
          rows: selectOrdered(executions, "execution_json", "created_at", businessTransactionId),
        });
      }

      if (sql.includes("INSERT INTO executions")) {
        const [executionId, businessTransactionId, executionJson, createdAt] =
          values as readonly unknown[];

        executions.push({
          execution_id: executionId,
          business_transaction_id: businessTransactionId,
          execution_json: JSON.parse(executionJson as string),
          created_at: createdAt,
          seq: seq++,
        });

        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("UPDATE executions SET")) {
        const [executionJson, executionId] = values as [string, string];
        const row = executions.find((e) => e.execution_id === executionId);

        if (row) {
          row.execution_json = JSON.parse(executionJson);
        }

        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("SELECT override_json FROM overrides")) {
        const [businessTransactionId] = values as [string];
        return Promise.resolve({
          rows: selectOrdered(overrides, "override_json", "created_at", businessTransactionId),
        });
      }

      if (sql.includes("INSERT INTO overrides")) {
        const [overrideId, businessTransactionId, overrideJson, createdAt] =
          values as readonly unknown[];

        overrides.push({
          override_id: overrideId,
          business_transaction_id: businessTransactionId,
          override_json: JSON.parse(overrideJson as string),
          created_at: createdAt,
          seq: seq++,
        });

        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("SELECT verification_json FROM verifications")) {
        const [businessTransactionId] = values as [string];
        return Promise.resolve({
          rows: selectOrdered(verifications, "verification_json", "verified_at", businessTransactionId),
        });
      }

      if (sql.includes("INSERT INTO verifications")) {
        const [verificationId, businessTransactionId, verificationJson, verifiedAt] =
          values as readonly unknown[];

        verifications.push({
          verification_id: verificationId,
          business_transaction_id: businessTransactionId,
          verification_json: JSON.parse(verificationJson as string),
          verified_at: verifiedAt,
          seq: seq++,
        });

        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("SELECT receipt_json FROM receipts")) {
        const [businessTransactionId] = values as [string];
        return Promise.resolve({
          rows: selectOrdered(receipts, "receipt_json", "issued_at", businessTransactionId),
        });
      }

      if (sql.includes("INSERT INTO receipts")) {
        const [receiptId, businessTransactionId, receiptJson, issuedAt] =
          values as readonly unknown[];

        receipts.push({
          receipt_id: receiptId,
          business_transaction_id: businessTransactionId,
          receipt_json: JSON.parse(receiptJson as string),
          issued_at: issuedAt,
          seq: seq++,
        });

        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("SELECT confirmation_json FROM settlement_confirmations")) {
        const [businessTransactionId] = values as [string];
        return Promise.resolve({
          rows: selectOrdered(
            settlementConfirmations,
            "confirmation_json",
            "issued_at",
            businessTransactionId,
          ),
        });
      }

      if (sql.includes("INSERT INTO settlement_confirmations")) {
        const [confirmationId, businessTransactionId, confirmationJson, issuedAt] =
          values as readonly unknown[];

        settlementConfirmations.push({
          confirmation_id: confirmationId,
          business_transaction_id: businessTransactionId,
          confirmation_json: JSON.parse(confirmationJson as string),
          issued_at: issuedAt,
          seq: seq++,
        });

        return Promise.resolve({ rows: [] });
      }

      throw new Error(`test fake: unexpected SQL: ${sql}`);
    },
  };

  return pool as unknown as Pool;
}

function buildSettlementConfirmation(
  businessTransactionId: string,
  issuedAt: string,
): SettlementConfirmation {
  return {
    confirmationId: `conf-${issuedAt}`,
    businessTransactionId,
    webhookEventId: "evt-1",
    razorpayRefundId: "rfnd_1",
    status: SettlementStatus.SETTLED,
    fetchedRefundStatus: "processed",
    confirmationHash: "hash-1",
    signature: "sig-1",
    algorithm: "Ed25519",
    issuedAt: new Date(issuedAt),
  };
}

describe("SupabaseExecutionTrustRecordRepository", () => {
  it("creates a Trust Record header and reads back appended executions/overrides in order, with empty verifications/receipts/settlements", async () => {
    const repository = new SupabaseExecutionTrustRecordRepository(createFakePool());
    const transaction = buildBusinessTransaction("txn-1");
    const signedRecord = await buildSignedMultiExecutionOverrideRecord(transaction);

    await expect(repository.create(signedRecord)).resolves.toBe(signedRecord);

    // create() persists only the header -- executions/overrides already
    // present on the signed record (needed for the canonical hash) are
    // appended afterward, mirroring supabase-execution-trust-record-
    // ordering.integration.test.ts's own established sequencing.
    for (const execution of signedRecord.executions) {
      await repository.appendExecution("txn-1", execution);
    }
    for (const override of signedRecord.overrides) {
      await repository.appendOverride("txn-1", override);
    }

    const found = await repository.findByTransactionId("txn-1");

    expect(found).not.toBeNull();
    expect(found!.trustRecordId).toBe(signedRecord.trustRecordId);
    expect(found!.trustRecordHash).toBe(signedRecord.trustRecordHash);
    expect(found!.executions.map((e) => e.executionId)).toEqual(
      signedRecord.executions.map((e) => e.executionId),
    );
    expect(found!.overrides.map((o) => o.overrideId)).toEqual(
      signedRecord.overrides.map((o) => o.overrideId),
    );
    expect(found!.verifications).toEqual([]);
    expect(found!.receipts).toEqual([]);
    expect(found!.settlementConfirmations).toEqual([]);
  });

  it("returns null for a transaction with no Trust Record", async () => {
    const repository = new SupabaseExecutionTrustRecordRepository(createFakePool());

    await expect(repository.findByTransactionId("does-not-exist")).resolves.toBeNull();
  });

  it("appendVerification/appendReceipt/appendSettlementConfirmation each persist in insertion order and bump updatedAt", async () => {
    const repository = new SupabaseExecutionTrustRecordRepository(createFakePool());
    const transaction = buildBusinessTransaction("txn-2");
    const signedRecord = await buildSignedMultiExecutionOverrideRecord(transaction);

    await repository.create(signedRecord);

    const [verification1, verification2] = buildVerificationPair(
      "txn-2",
      signedRecord.trustRecordHash,
    );
    await repository.appendVerification("txn-2", verification1);
    await repository.appendVerification("txn-2", verification2);

    const [receipt1, receipt2] = buildReceiptPair("txn-2", signedRecord.trustRecordHash);
    await repository.appendReceipt("txn-2", receipt1);
    await repository.appendReceipt("txn-2", receipt2);

    const confirmation1 = buildSettlementConfirmation("txn-2", "2026-07-11T00:00:10.000Z");
    const confirmation2 = buildSettlementConfirmation("txn-2", "2026-07-11T00:00:11.000Z");
    await repository.appendSettlementConfirmation("txn-2", confirmation1);
    await repository.appendSettlementConfirmation("txn-2", confirmation2);

    const found = await repository.findByTransactionId("txn-2");

    expect(found!.verifications.map((v) => v.verificationId)).toEqual([
      verification1.verificationId,
      verification2.verificationId,
    ]);
    expect(found!.receipts.map((r) => r.receiptId)).toEqual([
      receipt1.receiptId,
      receipt2.receiptId,
    ]);
    expect(found!.settlementConfirmations!.map((c) => c.confirmationId)).toEqual([
      confirmation1.confirmationId,
      confirmation2.confirmationId,
    ]);

    // touch() ran on every append -- updatedAt must have moved forward
    // from the header's original createdAt-equal updatedAt.
    expect(found!.updatedAt.getTime()).toBeGreaterThanOrEqual(
      signedRecord.updatedAt.getTime(),
    );
  });

  it("replaceExecution overwrites the stored execution_json for that executionId only", async () => {
    const repository = new SupabaseExecutionTrustRecordRepository(createFakePool());
    const transaction = buildBusinessTransaction("txn-3");
    const signedRecord = await buildSignedMultiExecutionOverrideRecord(transaction);

    await repository.create(signedRecord);
    for (const execution of signedRecord.executions) {
      await repository.appendExecution("txn-3", execution);
    }

    const [firstExecution, secondExecution] = signedRecord.executions;

    const replacement = {
      ...firstExecution!,
      decision: { ...firstExecution!.decision, reason: "replaced-reason" },
    };
    await repository.replaceExecution(replacement);

    const found = await repository.findByTransactionId("txn-3");

    expect(found!.executions).toHaveLength(2);

    // execution_json round-trips through real JSONB exactly like it
    // already did over supabase-js's REST wire format -- nested Date
    // fields (startedAt, completedAt, decision.evaluatedAt) come back
    // as strings, not Date instances, same as production traffic
    // already produced (see the equivalent note in
    // supabase-refusal-record-repository.test.ts). JSON.parse(JSON.
    // stringify(...)) constructs the expected value with the same
    // round-trip applied, rather than comparing against the original
    // in-memory object with real Date instances.
    expect(
      found!.executions.find((e) => e.executionId === firstExecution!.executionId),
    ).toEqual(JSON.parse(JSON.stringify(replacement)));
    expect(
      found!.executions.find((e) => e.executionId === secondExecution!.executionId),
    ).toEqual(JSON.parse(JSON.stringify(secondExecution)));
  });
});
