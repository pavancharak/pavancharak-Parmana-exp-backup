import "dotenv/config";

import { loadConfig } from "@parmana/shared";

import { assertStorageConfigured } from "./bootstrap/assertStorageConfigured.js";
import { assertSigningKeyMaterialConfigured } from "./bootstrap/assertSigningKeyMaterialConfigured.js";
import { createGracefulShutdown } from "./bootstrap/createGracefulShutdown.js";
import { createExecutionSystem } from "./bootstrap/createExecutionSystem.js";
import { createApplication } from "./application.js";
import { createCallerAuthenticator } from "./bootstrap/createCallerAuthenticator.js";
import { resolveRazorpayWebhookSecret } from "./bootstrap/resolveRazorpayWebhookSecret.js";
import { createRazorpayWebhookEventStore } from "./bootstrap/createRazorpayWebhookEventStore.js";
import { createRazorpayWebhookAuditSink } from "./bootstrap/createRazorpayWebhookAuditSink.js";
import { createApp } from "./app.js";

/**
 * Fail-closed startup validation, before any other bootstrap runs and
 * before the port is ever bound. Everything else this module calls
 * below already fails closed once invoked (createNonceStore,
 * createCallerAuditSink, createCallerAuthenticator, ...) — these two
 * run first specifically because nothing else in this codebase
 * validates them eagerly: durable storage is normally validated
 * lazily (repositories.ts's Proxy, deliberately, so test collection on
 * a machine with no credentials doesn't construct a live Supabase
 * client — see assertStorageConfigured.ts), and signing key material
 * is normally validated lazily too (FileKeyProvider, only on the first
 * sign/verify call — see assertSigningKeyMaterialConfigured.ts).
 * Without these, a misconfigured process could bind the port, pass
 * /health, and only fail on its first real request.
 */
assertStorageConfigured();
assertSigningKeyMaterialConfigured();

const executionSystem =
  createExecutionSystem();

const application =
  createApplication(
    executionSystem,
  );

const callerAuth =
  createCallerAuthenticator();

const razorpayWebhookSecret = resolveRazorpayWebhookSecret();

if (razorpayWebhookSecret === undefined) {
  console.warn({
    event: "razorpay_webhook_unavailable",
    reason: "RAZORPAY_WEBHOOK_SECRET is not configured.",
  });
}

const app =
  createApp(
    application,
    {
      callerAuth: callerAuth.disabled
        ? "disabled"
        : {
            authenticator: callerAuth.authenticator,
            auditSink: callerAuth.auditSink,
          },
      razorpayWebhook: razorpayWebhookSecret === undefined
        ? "disabled"
        : {
            secret: razorpayWebhookSecret,
            eventStore: createRazorpayWebhookEventStore(),
            auditSink: createRazorpayWebhookAuditSink(),
          },
      rateLimit: loadConfig().rateLimit,
    },
  );

// PaaS platforms (Railway, Render, Fly, etc.) commonly inject PORT
// dynamically at deploy time and expect the process to bind to
// whatever value they provide, not a hardcoded default — Config.ts's
// api.port already reads process.env.PORT with a 3000 fallback for
// local development, so this is the only place that needs to change to
// stop hardcoding it.
const PORT = loadConfig().api.port;
const HOST = process.env.HOST ?? "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`API running on http://${HOST}:${PORT}`);
});
// Graceful shutdown on SIGTERM/SIGINT — see createGracefulShutdown.ts
// for the full reasoning and what it guards against.
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);
const shutdown = createGracefulShutdown({ server, timeoutMs: SHUTDOWN_TIMEOUT_MS });

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
