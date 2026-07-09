import type { NonceStore } from "@parmana/envelope-verifier";
import { MemoryNonceStore } from "@parmana/envelope-verifier";

/**
 * Creates the NonceStore used by the ExecutionGateway.
 *
 * Current implementation:
 *   MemoryNonceStore
 *
 * Production:
 *   Replace with a shared persistent store
 *   (Redis, Supabase, etc.).
 */
export function createNonceStore(): NonceStore {
  return new MemoryNonceStore();
}