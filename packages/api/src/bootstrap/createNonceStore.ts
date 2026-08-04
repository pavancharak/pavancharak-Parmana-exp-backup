import type { NonceStore } from "@parmana/envelope-verifier";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { PostgresPoolFactory, SupabaseNonceStore } from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the NonceStore used by the ExecutionGateway.
 *
 * Test wiring (NODE_ENV=test): MemoryNonceStore — mirrors the
 * production/test split createCredentialProvider.ts already
 * established for the vendor-payment connector credential.
 *
 * Production: SupabaseNonceStore, a durable store shared across
 * every process pointed at the same Supabase project. Closes G-13
 * (docs/VERIFICATION-GAPS.md): replay-nonce state no longer resets
 * on process restart. Fails closed at startup if DATABASE_URL is not
 * configured — never silently falls back to an in-memory store,
 * since that would silently narrow replay protection to a single
 * process's uptime with no signal that it happened.
 *
 * Wired to PostgresPoolFactory (DATABASE_URL), not SupabaseClientFactory
 * (SUPABASE_URL) — SupabaseNonceStore now writes via a direct Postgres
 * connection, removing PostgREST from this store's failure modes
 * entirely (see SupabaseNonceStore for the incident this generalizes
 * from).
 */
export function createNonceStore(): NonceStore {
  if (process.env.NODE_ENV === "test") {
    return new MemoryNonceStore();
  }

  assertDatabaseUrlConfigured("NonceStore");

  return new SupabaseNonceStore(PostgresPoolFactory.create());
}