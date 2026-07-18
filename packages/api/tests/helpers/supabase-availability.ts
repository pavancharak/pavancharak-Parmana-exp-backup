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

/**
 * Resolves whether a Supabase-gated suite should run, and enforces the
 * live-credential opt-in (G-3): SUPABASE_* being configured is not by
 * itself enough to run against a live project. ALLOW_LIVE_SUPABASE=1
 * must also be set explicitly, or the suite refuses to run outright —
 * a thrown error during test collection, not a silent skip — rather
 * than silently writing to a real database. Call once per file, at
 * module scope, before any describe/it that depends on the result.
 */
export function resolveSupabaseGate(suiteLabel: string): boolean {
  const configured = hasSupabaseConfig();
  const optedIn = process.env.ALLOW_LIVE_SUPABASE === "1";

  if (configured && !optedIn) {
    throw new Error(
      `${suiteLabel}: SUPABASE_URL and a Supabase key are configured, but ` +
        "ALLOW_LIVE_SUPABASE=1 is not set. Refusing to run against a live " +
        "Supabase project without the explicit opt-in. Set " +
        "ALLOW_LIVE_SUPABASE=1 to run this suite, or unset SUPABASE_* to " +
        "skip it.",
    );
  }

  // G-14: a live run was explicitly requested (the opt-in is set), but
  // SUPABASE_URL / a Supabase key is not visible to this worker. Explicit
  // intent must never quietly degrade to describe.skipIf's silent skip —
  // that's exactly how the nonce-store restart-simulation test went
  // unnoticed for a release. Something upstream of this call (env loading)
  // is broken; surface it as a hard failure, not a green skip.
  if (optedIn && !configured) {
    throw new Error(
      `${suiteLabel}: ALLOW_LIVE_SUPABASE=1 is set — a live run was ` +
        "explicitly requested — but Supabase env is not visible to this " +
        "worker — env loading is broken. SUPABASE_URL and a Supabase key " +
        "should have been loaded by vitest.setup.ts; refusing to silently " +
        "skip a suite that was explicitly asked to run live.",
    );
  }

  if (!configured) {
    console.log(
      `[SKIP] ${suiteLabel}: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or ` +
        "SUPABASE_ANON_KEY) not set. See packages/api/README.md to enable " +
        "this suite.",
    );
  }

  return configured;
}

