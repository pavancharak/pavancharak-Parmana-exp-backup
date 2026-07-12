import express from "express";

import { errorHandler } from "./middleware/error-handler.js";
import { createCallerAuthMiddleware } from "./middleware/caller-auth.js";

import policyRoutes from "./routes/policies.js";
import type { ExecutionTrustApplication } from "@parmana/runtime";

import { createExecuteRouter } from "./routes/execute.js";
import healthRoutes from "./routes/health.js";
import { createReceiptRouter } from "./routes/receipt.js";

import { createReplayRouter } from "./routes/replay.js";
import { createReceiptGetRouter } from "./routes/receipt-get.js";
import { createTransactionsRouter } from "./routes/transactions.js";
import { createTrustRecordsRouter } from "./routes/trust-records.js";
import { createVerifyGetRouter } from "./routes/verify-get.js";
import { createVerifyRouter } from "./routes/verify.js";



import versionRoutes from "./routes/version.js";

import type { CallerAuthenticator } from "./auth/CallerAuthenticator.js";
import type { CallerAuditSink } from "./auth/CallerAuditSink.js";

export interface CreateAppOptions {
  /**
   * When provided, every route except /health requires a
   * valid caller credential. When omitted, no caller-auth
   * middleware is mounted at all, which is what every
   * pre-existing test in this package relies on. Production
   * (server.ts) always provides this.
   */
  readonly callerAuth?: {
    readonly authenticator: CallerAuthenticator;
    readonly auditSink: CallerAuditSink;
  };
}

export function createApp(
  application: ExecutionTrustApplication,
  options: CreateAppOptions = {},
) {
  const app = express();

app.use(express.json());

/**
 * System
 *
 * /health is the one route exempt from caller
 * authentication: liveness probes must be able to reach it
 * with no credential. Everything below this line, including
 * "/" and "/version", sits behind the middleware when it is
 * provided.
 */
app.use("/health", healthRoutes);

if (options.callerAuth) {
  app.use(
    createCallerAuthMiddleware(
      options.callerAuth.authenticator,
      options.callerAuth.auditSink,
    ),
  );
}

app.get("/", (_req, res) => {
  res.json({
    name: "Parmana",
    status: "UP",
  });
});

app.use("/version", versionRoutes);



app.use(
  "/execute",
  createExecuteRouter(application),
);

/**
 * Verification
 */
app.use(
  "/verify",
  createVerifyRouter(application),
);

app.use(
  "/verification",
  createVerifyGetRouter(application),
);/**
 * Receipts
 */
app.use(
  "/receipt",
  createReceiptRouter(application),
);
app.use(
  "/receipt/latest",
  createReceiptGetRouter(application),
);

/**
 * Business Transactions
 */
app.use(
  "/transactions",
  createTransactionsRouter(application),
);

/**
 * Policies
 */
app.use(
  "/policies",
  policyRoutes,
);

/**
 * Execution Trust Records
 */
app.use(
  "/trust-records",
  createTrustRecordsRouter(application),
);

/**
 * Replay
 */
app.use(
  "/replay",
  createReplayRouter(application),
);

/**
 * Error handling
 *
 * Must be registered after all routes.
 */
app.use(errorHandler);

return app;
}