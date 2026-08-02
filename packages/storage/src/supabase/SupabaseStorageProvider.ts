import type {
  BusinessTransactionRepository,
  ExecutionTrustRecordRepository,
  RefusalRecordRepository,
} from "@parmana/shared";

import type { StorageProvider } from "../StorageProvider.js";

import { SupabaseClientFactory } from "./SupabaseClientFactory.js";

import { SupabaseBusinessTransactionRepository } from "./SupabaseBusinessTransactionRepository.js";

import { SupabaseExecutionTrustRecordRepository } from "./SupabaseExecutionTrustRecordRepository.js";

import { SupabaseRefusalRecordRepository } from "./SupabaseRefusalRecordRepository.js";

/**
 * Supabase Storage Provider
 */
export class SupabaseStorageProvider implements StorageProvider {
  readonly businessTransactions: BusinessTransactionRepository;
  readonly trustRecords: ExecutionTrustRecordRepository;
  readonly refusalRecords: RefusalRecordRepository;

  constructor() {
    const client = SupabaseClientFactory.create();

    this.businessTransactions =
      new SupabaseBusinessTransactionRepository(client);

    this.trustRecords =
      new SupabaseExecutionTrustRecordRepository(client);

    this.refusalRecords =
      new SupabaseRefusalRecordRepository(client);

    Object.freeze(this);
  }
}