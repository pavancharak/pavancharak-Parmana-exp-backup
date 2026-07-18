/**
 * Fail-closed precondition shared by every bootstrap factory that
 * requires a durable, Supabase-backed store in production
 * (createNonceStore.ts, createCallerAuditSink.ts — both close G-13,
 * docs/VERIFICATION-GAPS.md). Throws a clear, actionable error naming
 * the missing environment variable(s) rather than letting
 * SupabaseClientFactory.create() fail later with its generic
 * "supabaseUrl is required." message, or — worse — constructing a
 * client that only fails on first use.
 */
export function assertSupabaseConfigured(storeName: string): void {
  if (
    !process.env.SUPABASE_URL ||
    (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY)
  ) {
    throw new Error(
      `Durable ${storeName} requires SUPABASE_URL and a Supabase key ` +
        "(SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY) to be configured. " +
        `Refusing to start with no persistent ${storeName} — an in-memory ` +
        "implementation must never be used in production (G-13).",
    );
  }
}
