import type { NonceStore } from "@parmana/envelope-verifier";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { SupabaseClientFactory, SupabaseNonceStore } from "@parmana/storage";

import { assertSupabaseConfigured } from "./assertSupabaseConfigured.js";

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
 * on process restart. Fails closed at startup if Supabase is not
 * configured — never silently falls back to an in-memory store,
 * since that would silently narrow replay protection to a single
 * process's uptime with no signal that it happened.
 */
export function createNonceStore(): NonceStore {
  if (process.env.NODE_ENV === "test") {
    return new MemoryNonceStore();
  }

  assertSupabaseConfigured("NonceStore");

  return new SupabaseNonceStore(SupabaseClientFactory.create());
}