import type {
  BusinessTransactionRepository,
  ExecutionTrustRecordRepository,
  RefusalRecordRepository,
} from "@parmana/shared";

import type { StorageProvider } from "../StorageProvider.js";

import { PostgresPoolFactory } from "../postgres/PostgresPoolFactory.js";

import { SupabaseBusinessTransactionRepository } from "./SupabaseBusinessTransactionRepository.js";

import { SupabaseExecutionTrustRecordRepository } from "./SupabaseExecutionTrustRecordRepository.js";

import { SupabaseRefusalRecordRepository } from "./SupabaseRefusalRecordRepository.js";

/**
 * Supabase Storage Provider.
 *
 * Wires all three repositories to a single, shared PostgresPoolFactory
 * pool (DATABASE_URL) — a direct Postgres connection, not
 * SupabaseClientFactory/PostgREST. This removes PostgREST from the
 * failure modes of every table this provider touches (business
 * transactions, execution trust records and their sub-collections,
 * refusal records), not just the audit sinks that broke first (see
 * SupabaseCallerAuditSink for the originating incident).
 */
export class SupabaseStorageProvider implements StorageProvider {
  readonly businessTransactions: BusinessTransactionRepository;
  readonly trustRecords: ExecutionTrustRecordRepository;
  readonly refusalRecords: RefusalRecordRepository;

  constructor() {
    const pool = PostgresPoolFactory.create();

    this.businessTransactions =
      new SupabaseBusinessTransactionRepository(pool);

    this.trustRecords =
      new SupabaseExecutionTrustRecordRepository(pool);

    this.refusalRecords =
      new SupabaseRefusalRecordRepository(pool);

    Object.freeze(this);
  }
}