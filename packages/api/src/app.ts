import express from "express";

import { errorHandler } from "./middleware/error-handler.js";

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

export function createApp(
  application: ExecutionTrustApplication,
) {
  const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "Parmana",
    status: "UP",
  });
});

/**
 * System
 */
app.use("/health", healthRoutes);
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