import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DuplicateBusinessTransactionError,
  type BusinessTransactionRepository,
} from "@parmana/shared";

import { MemoryBusinessTransactionRepository } from "../../src/memory/MemoryBusinessTransactionRepository.js";
import { SupabaseBusinessTransactionRepository } from "../../src/supabase/SupabaseBusinessTransactionRepository.js";

import { buildBusinessTransaction } from "../fixtures/multi-item-trust-record.js";

function createFakeSupabaseClient(): SupabaseClient {
  const rows = new Set<string>();

  const client = {
    from() {
      return {
        insert(row: { business_transaction_id: string }) {
          if (rows.has(row.business_transaction_id)) {
            return Promise.resolve({
              error: { code: "23505", message: "duplicate key value" },
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

/**
 * G-1's "consistent semantics across implementations" requirement:
 * callers must not be able to tell which backing store rejected a
 * duplicate from the shape of the error alone.
 */
describe.each<[string, () => BusinessTransactionRepository]>([
  ["MemoryBusinessTransactionRepository", () => new MemoryBusinessTransactionRepository()],
  [
    "SupabaseBusinessTransactionRepository",
    () => new SupabaseBusinessTransactionRepository(createFakeSupabaseClient()),
  ],
])("%s", (_name, createRepository) => {
  it("throws DuplicateBusinessTransactionError, with the same message format, for a duplicate businessTransactionId", async () => {
    const repository = createRepository();
    const transaction = buildBusinessTransaction("txn-consistency");

    await repository.create(transaction);

    let caught: unknown;
    try {
      await repository.create(transaction);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DuplicateBusinessTransactionError);
    expect((caught as Error).message).toBe(
      "Business Transaction 'txn-consistency' already exists.",
    );
  });
});
