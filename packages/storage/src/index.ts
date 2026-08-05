/**
 * @parmana/storage
 *
 * Canonical public API.
 */

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------

export * from "./StorageEngine.js";
export * from "./StorageBuilder.js";

// -----------------------------------------------------------------------------
// Storage Abstraction
// -----------------------------------------------------------------------------

export * from "./StorageProvider.js";
export * from "./StorageFactory.js";
export * from "./StorageConfiguration.js";

// -----------------------------------------------------------------------------
// Ledger
// -----------------------------------------------------------------------------

export * from "./ledger/AppendOnlyLedger.js";
export * from "./ledger/LedgerEntry.js";
export * from "./ledger/LedgerSerializer.js";

// -----------------------------------------------------------------------------
// Repository Interfaces
// -----------------------------------------------------------------------------

export * from "./repositories/ExecutionRepository.js";
export * from "./repositories/VerificationRepository.js";
export * from "./repositories/CryptoProofRepository.js";

// -----------------------------------------------------------------------------
// Built-in Providers
// -----------------------------------------------------------------------------

export * from "./memory/MemoryStorageProvider.js";

export * from "./memory/MemoryBusinessTransactionRepository.js";
export * from "./memory/MemoryExecutionTrustRecordRepository.js";
export * from "./memory/MemoryRefusalRecordRepository.js";
export * from "./memory/MemoryChallengeRecordRepository.js";
export * from "./memory/MemoryPolicyRepository.js";

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export * from "./errors/StorageError.js";
export * from "./errors/PostgresErrorCodes.js";

export * from "./supabase/SupabaseStorageProvider.js";
export * from "./supabase/SupabaseBusinessTransactionRepository.js";
export * from "./supabase/SupabaseExecutionTrustRecordRepository.js";
export * from "./supabase/SupabaseRefusalRecordRepository.js";
export * from "./supabase/SupabaseNonceStore.js";
export * from "./supabase/SupabaseRazorpayDailyRefundLedger.js";
export * from "./supabase/SupabaseClientFactory.js";

// -----------------------------------------------------------------------------
// Postgres (direct connection, bypassing PostgREST)
// -----------------------------------------------------------------------------

export * from "./postgres/PostgresPoolFactory.js";
export * from "./postgres/PostgresChallengeRecordRepository.js";