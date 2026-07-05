/**
 * Whether real Supabase credentials are configured in the
 * environment.
 *
 * Supabase-backed integration tests need a live project to talk
 * to and cannot run hermetically from a bare clone (see
 * packages/api/README.md for the env vars that enable them).
 * Tests gate on this instead of failing or hanging when the
 * config is absent.
 */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY),
  );
}
