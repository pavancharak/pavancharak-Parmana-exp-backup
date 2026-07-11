/**
 * Whether real Supabase credentials are configured in the
 * environment.
 *
 * Supabase-backed integration tests need a live project to talk
 * to and cannot run hermetically from a bare clone. Tests gate on
 * this instead of failing or hanging when the config is absent.
 *
 * Mirrors packages/api/tests/helpers/supabase-availability.ts —
 * kept local rather than imported across the package boundary so
 * @parmana/storage's test suite has no dependency on @parmana/api.
 */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY),
  );
}
