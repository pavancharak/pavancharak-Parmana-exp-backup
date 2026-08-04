import { Router } from "express";

import { PostgresPoolFactory } from "@parmana/storage";

/**
 * GET /ready
 *
 * Readiness probe, distinct from /health's pure liveness check: this
 * one actually touches Postgres with one cheap query (`SELECT 1`,
 * transferring no table rows, just confirming the connection and
 * credentials work) so a PaaS orchestrator can tell a process that is
 * up but backed by dead storage apart from one that is genuinely
 * ready to serve traffic — and route around it accordingly.
 *
 * When storage is not Supabase-backed (NODE_ENV=test, or
 * PARMANA_STORAGE=memory outside test), there is no external
 * dependency to probe, so this reports ready unconditionally — the
 * same distinction assertStorageConfigured.ts already draws at boot.
 *
 * Queries via a direct Postgres connection (PostgresPoolFactory), not
 * supabase-js/PostgREST — this probe previously depended on
 * PostgREST for a `consumed_nonces` HEAD request, which meant a
 * PostgREST-layer outage (the exact incident class this migration
 * removes) could make the readiness probe itself unreliable.
 */
export function createReadyRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    if (process.env.NODE_ENV === "test" || process.env.PARMANA_STORAGE !== "supabase") {
      res.json({ status: "READY", storage: "not-supabase-backed" });
      return;
    }

    try {
      const pool = PostgresPoolFactory.create();
      await pool.query("SELECT 1");

      res.json({ status: "READY" });
    } catch (error) {
      res.status(503).json({
        status: "NOT_READY",
        reason: error instanceof Error ? error.message : "unknown storage error",
      });
    }
  });

  return router;
}
