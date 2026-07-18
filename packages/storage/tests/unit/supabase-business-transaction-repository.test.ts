import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DuplicateBusinessTransactionError } from "@parmana/shared";

import { SupabaseBusinessTransactionRepository } from "../../src/supabase/SupabaseBusinessTransactionRepository.js";

import { buildBusinessTransaction } from "../fixtures/multi-item-trust-record.js";

function createFakeClient(options?: {
  readonly insertError?: { code?: string; message: string };
}): SupabaseClient {
  const rows = new Set<string>();

  const client = {
    from(table: string) {
      expect(table).toBe("business_transactions");

      return {
        insert(row: { business_transaction_id: string }) {
          if (options?.insertError) {
            return Promise.resolve({ error: options.insertError });
          }

          if (rows.has(row.business_transaction_id)) {
            return Promise.resolve({
              error: {
                code: "23505",
                message:
                  `duplicate key value violates unique constraint ` +
                  `"business_transactions_pkey"`,
              },
            });
          }

          rows.add(row.business_transaction_id);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return client as unknown as SupabaseClient;
}

describe("SupabaseBusinessTransactionRepository (G-1)", () => {
  it("creates a transaction that does not yet exist", async () => {
    const repository = new SupabaseBusinessTransactionRepository(
      createFakeClient(),
    );

    await expect(
      repository.create(buildBusinessTransaction("txn-1")),
    ).resolves.toBeDefined();
  });

  it("maps a 23505 unique-violation to DuplicateBusinessTransactionError, not the raw Postgres error", async () => {
    const repository = new SupabaseBusinessTransactionRepository(
      createFakeClient(),
    );

    await repository.create(buildBusinessTransaction("txn-1"));

    await expect(
      repository.create(buildBusinessTransaction("txn-1")),
    ).rejects.toBeInstanceOf(DuplicateBusinessTransactionError);
  });

  it("still fails closed on a non-unique-violation storage error: propagates the raw error rather than swallowing it or misreporting it as a duplicate", async () => {
    const repository = new SupabaseBusinessTransactionRepository(
      createFakeClient({
        insertError: { code: "08006", message: "connection failure" },
      }),
    );

    await expect(
      repository.create(buildBusinessTransaction("txn-1")),
    ).rejects.toMatchObject({ code: "08006" });
  });
});
