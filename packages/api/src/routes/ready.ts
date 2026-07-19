import { Router } from "express";

import { SupabaseClientFactory } from "@parmana/storage";

/**
 * GET /ready
 *
 * Readiness probe, distinct from /health's pure liveness check: this
 * one actually touches Supabase with one cheap read (a HEAD request
 * against `consumed_nonces`, transferring no rows, just confirming the
 * connection and credentials work) so a PaaS orchestrator can tell a
 * process that is up but backed by dead storage apart from one that is
 * genuinely ready to serve traffic — and route around it accordingly.
 *
 * When storage is not Supabase-backed (NODE_ENV=test, or
 * PARMANA_STORAGE=memory outside test), there is no external
 * dependency to probe, so this reports ready unconditionally — the
 * same distinction assertStorageConfigured.ts already draws at boot.
 */
export function createReadyRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    if (process.env.NODE_ENV === "test" || process.env.PARMANA_STORAGE !== "supabase") {
      res.json({ status: "READY", storage: "not-supabase-backed" });
      return;
    }

    try {
      const client = SupabaseClientFactory.create();
      const { error } = await client.from("consumed_nonces").select("nonce", { count: "exact", head: true }).limit(1);

      if (error) {
        throw new Error(error.message);
      }

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
