import type {
  BusinessTransactionRepository,
  ExecutionTrustRecordRepository,
  RefusalRecordRepository,
} from "@parmana/shared";

import type { StorageProvider } from "../StorageProvider.js";

import { MemoryBusinessTransactionRepository } from "./MemoryBusinessTransactionRepository.js";

import { MemoryExecutionTrustRecordRepository } from "./MemoryExecutionTrustRecordRepository.js";

import { MemoryRefusalRecordRepository } from "./MemoryRefusalRecordRepository.js";

/**
 * Memory Storage Provider.
 *
 * Provides in-memory repository implementations
 * for development, testing, and local execution.
 */
export class MemoryStorageProvider implements StorageProvider {
  readonly businessTransactions: BusinessTransactionRepository;

  readonly trustRecords: ExecutionTrustRecordRepository;

  readonly refusalRecords: RefusalRecordRepository;

  constructor() {
    this.businessTransactions = new MemoryBusinessTransactionRepository();

    this.trustRecords = new MemoryExecutionTrustRecordRepository();

    this.refusalRecords = new MemoryRefusalRecordRepository();

    Object.freeze(this);
  }
}
