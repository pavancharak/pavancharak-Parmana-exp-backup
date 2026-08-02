import type {
  BusinessTransactionRepository,
  ExecutionTrustRecordRepository,
  RefusalRecordRepository,
} from "@parmana/shared";

/**
 * Parmana Storage Provider.
 *
 * Exposes all repository implementations
 * for a storage backend.
 */
export interface StorageProvider {
  /**
   * Business Transaction repository.
   */
  readonly businessTransactions: BusinessTransactionRepository;

  /**
   * Execution Trust Record repository.
   */
  readonly trustRecords: ExecutionTrustRecordRepository;

  /**
   * Refusal Record repository (RFC-0021).
   */
  readonly refusalRecords: RefusalRecordRepository;
}
