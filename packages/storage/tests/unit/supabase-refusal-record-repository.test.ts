import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RefusalRecord } from "@parmana/shared";

import { SupabaseRefusalRecordRepository } from "../../src/supabase/SupabaseRefusalRecordRepository.js";

function buildRefusalRecord(
  businessTransactionId: string,
): RefusalRecord {
  const now = new Date("2026-08-02T00:00:00.000Z");

  return {
    refusalRecordId: `refusal-${businessTransactionId}`,

    businessTransactionId,

    decision: {
      decisionId: `decision-${businessTransactionId}`,
      intentId: `intent-${businessTransactionId}`,
      policy: {
        name: "vendor-payment",
        version: "2.0.0",
        schemaVersion: "1.0.0",
      },
      signals: { paymentAmount: 5000 },
      outcome: "REJECTED" as const,
      reason: "test rejection",
      evaluatedAt: now,
    },

    evaluatedIntent: {
      target: "ATTACKER-CONTROLLED-ACCOUNT-9999",
      parameters: { amount: 999999999 },
    },

    bindingViolations: [
      {
        signalKey: "paymentAmount",
        intentPath: "parameters.amount",
        signalValue: 5000,
        intentValue: 999999999,
      },
    ],

    submittedBy: "caller-1",

    refusalRecordHash: "test-hash",

    signature: {
      algorithm: "ed25519",
      keyId: "default",
      value: "test-signature-value",
      signedAt: now,
    },

    createdAt: now,
  };
}

function createFakeClient(): {
  client: SupabaseClient;
  rows: Map<string, Record<string, unknown>>;
} {
  const rows = new Map<string, Record<string, unknown>>();

  const client = {
    from(table: string) {
      expect(table).toBe("refusal_records");

      return {
        insert(row: { business_transaction_id: string }) {
          rows.set(row.business_transaction_id, row);
          return Promise.resolve({ error: null });
        },

        select() {
          return {
            eq(_column: string, value: string) {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: rows.get(value) ?? null,
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, rows };
}

describe("SupabaseRefusalRecordRepository (RFC-0021)", () => {
  it("creates a Refusal Record and round-trips it through findByTransactionId with all fields intact", async () => {
    const { client } = createFakeClient();
    const repository = new SupabaseRefusalRecordRepository(client);

    const record = buildRefusalRecord("txn-1");

    await expect(repository.create(record)).resolves.toBe(record);

    const found = await repository.findByTransactionId("txn-1");

    expect(found).not.toBeNull();
    expect(found!.refusalRecordId).toBe(record.refusalRecordId);
    expect(found!.businessTransactionId).toBe("txn-1");
    expect(found!.decision).toEqual(record.decision);
    expect(found!.evaluatedIntent).toEqual(record.evaluatedIntent);
    expect(found!.bindingViolations).toEqual(record.bindingViolations);
    expect(found!.submittedBy).toBe("caller-1");
    expect(found!.refusalRecordHash).toBe("test-hash");
    expect(found!.signature).toEqual(record.signature);
    expect(found!.createdAt).toEqual(record.createdAt);
  });

  it("round-trips a record with no bindingViolations (ordinary policy REJECT) as undefined, not null or []", async () => {
    const { client } = createFakeClient();
    const repository = new SupabaseRefusalRecordRepository(client);

    const record = { ...buildRefusalRecord("txn-2") };
    delete (record as { bindingViolations?: unknown }).bindingViolations;

    await repository.create(record);

    const found = await repository.findByTransactionId("txn-2");

    expect(found!.bindingViolations).toBeUndefined();
  });

  it("returns null for a transaction with no Refusal Record", async () => {
    const { client } = createFakeClient();
    const repository = new SupabaseRefusalRecordRepository(client);

    const found = await repository.findByTransactionId("txn-does-not-exist");

    expect(found).toBeNull();
  });

  it("propagates a storage error rather than swallowing it", async () => {
    const client = {
      from(table: string) {
        expect(table).toBe("refusal_records");

        return {
          insert() {
            return Promise.resolve({
              error: { code: "08006", message: "connection failure" },
            });
          },
        };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseRefusalRecordRepository(client);

    await expect(
      repository.create(buildRefusalRecord("txn-3")),
    ).rejects.toMatchObject({ code: "08006" });
  });
});
