import express from "express";
import documentationRoutes from "./routes/documentation.js";

import { errorHandler } from "./middleware/error-handler.js";
import { createCallerAuthMiddleware } from "./middleware/caller-auth.js";

import policyRoutes from "./routes/policies.js";
import type { ExecutionTrustApplication } from "@parmana/runtime";

import { createExecuteRouter } from "./routes/execute.js";
import healthRoutes from "./routes/health.js";
import openapiRoutes from "./routes/openapi.js";
import { createReceiptRouter } from "./routes/receipt.js";

import { createReplayRouter } from "./routes/replay.js";
import { createReceiptGetRouter } from "./routes/receipt-get.js";
import { createTransactionsRouter } from "./routes/transactions.js";
import { createTrustRecordsRouter } from "./routes/trust-records.js";
import { createVerifyGetRouter } from "./routes/verify-get.js";
import { createVerifyRouter } from "./routes/verify.js";
import { createRefusalVerifyRouter } from "./routes/refusal-verify.js";
import { createRefusalGetRouter } from "./routes/refusal-get.js";
import { createAuditVerifyRouter } from "./routes/audit-verify.js";
import { createRazorpayWebhookRouter } from "./routes/webhooks-razorpay.js";
import { createReadyRouter } from "./routes/ready.js";

import versionRoutes from "./routes/version.js";

import type { CallerAuthenticator } from "./auth/CallerAuthenticator.js";
import type { CallerAuditSink } from "./auth/CallerAuditSink.js";
import type { RazorpayWebhookEventStore } from "./webhooks/RazorpayWebhookEventStore.js";
import type { RazorpayWebhookAuditSink } from "./webhooks/RazorpayWebhookAuditSink.js";

/**
 * Every call site must state its caller-auth choice explicitly:
 * either a real authenticator/auditSink pair, or the literal
 * string "disabled" to mount the app with no caller-auth
 * middleware at all. There is no default — silently omitting
 * this option is exactly the failure mode this type exists to
 * rule out (see docs/CLAIMS.md and the July 2026 audit closeout).
 */
export type CallerAuthOption =
  | "disabled"
  | {
      readonly authenticator: CallerAuthenticator;
      readonly auditSink: CallerAuditSink;
    };

/**
 * Same explicit-choice discipline as CallerAuthOption, for the same
 * reason: "disabled" mounts no /webhooks/razorpay route at all (a
 * request to it 404s); the object form requires the secret plus both
 * stores the route needs (resolveRazorpayWebhookSecret.ts,
 * createRazorpayWebhookEventStore.ts, createRazorpayWebhookAuditSink.ts
 * build these — server.ts is the reference call site). No default.
 */
export type RazorpayWebhookOption =
  | "disabled"
  | {
      readonly secret: string;
      readonly eventStore: RazorpayWebhookEventStore;
      readonly auditSink: RazorpayWebhookAuditSink;
    };

export interface CreateAppOptions {
  readonly callerAuth: CallerAuthOption;
  readonly razorpayWebhook: RazorpayWebhookOption;
}

export function createApp(
  application: ExecutionTrustApplication,
  options: CreateAppOptions,
) {
  const app = express();

/**
 * Trust exactly one proxy hop: Fly.io's edge (fly.toml sets
 * force_https there), the only reverse proxy in front of this app.
 * Without this, Express ignores X-Forwarded-For and ignores
 * X-Forwarded-Proto, so req.ip and req.protocol/req.secure both
 * reflect the proxy's own connection to this process rather than the
 * original client's.
 */
app.set("trust proxy", 1);

/**
 * Razorpay webhooks
 *
 * Mounted before the global express.json() below, and with its own
 * express.raw() (see routes/webhooks-razorpay.ts), so signature
 * verification runs over the exact wire bytes Razorpay signed — never
 * a re-serialized req.body. "disabled" mounts no route at all, so a
 * request to it 404s — mirroring createConnectorRegistry.ts's
 * fail-closed "capability simply absent" shape for the Razorpay
 * connector itself.
 */
if (options.razorpayWebhook !== "disabled") {
  app.use(
    "/webhooks/razorpay",
    createRazorpayWebhookRouter({
      secret: options.razorpayWebhook.secret,
      eventStore: options.razorpayWebhook.eventStore,
      auditSink: options.razorpayWebhook.auditSink,
    }),
  );
}

app.use(express.json());

/**
 * System
 *
 * /health, /ready, and /openapi.yaml are the routes exempt from
 * caller authentication: liveness/readiness probes and API
 * documentation consumers must be able to reach them with no
 * credential (a caller cannot discover how to get a key from a spec it
 * is not allowed to read, and a PaaS orchestrator has no API key at
 * all). Everything below this line, including "/" and "/version",
 * sits behind the middleware when it is provided.
 */
app.use("/health", healthRoutes);
app.use("/ready", createReadyRouter());
app.use("/openapi.yaml", openapiRoutes);
app.use("/documentation", documentationRoutes);

/**
 * RFC-0021: deliberately exempt from caller-auth, alongside the
 * system routes above -- this is the unauthenticated, third-party
 * signature-verification capability, not a data-access route. Its
 * ownership-scoped counterpart, GET /refusal/:businessTransactionId,
 * is mounted below the middleware with everything else.
 */
app.use(
  "/refusal/verify",
  createRefusalVerifyRouter(application),
);

/**
 * Audit-sink signing milestone: the same unauthenticated,
 * third-party-verifiable capability as POST /refusal/verify above,
 * over the two durable audit trails (caller_audit_events,
 * razorpay_webhook_audit_events) instead of Refusal Records. No
 * ExecutionTrustApplication dependency -- verification here is pure
 * signature-over-bytes, with no database lookup involved.
 */
app.use(
  "/audit/verify",
  createAuditVerifyRouter(),
);

if (options.callerAuth !== "disabled") {
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
);

/**
 * Refusal Records (RFC-0021)
 *
 * Ownership-scoped lookup by ID -- the unauthenticated verification
 * route (POST /refusal/verify) is mounted above, before caller-auth.
 */
app.use(
  "/refusal",
  createRefusalGetRouter(application),
);
/**
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