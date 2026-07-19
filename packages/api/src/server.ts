import "dotenv/config";

import { createExecutionSystem } from "./bootstrap/createExecutionSystem.js";
import { createApplication } from "./application.js";
import { createCallerAuthenticator } from "./bootstrap/createCallerAuthenticator.js";
import { resolveRazorpayWebhookSecret } from "./bootstrap/resolveRazorpayWebhookSecret.js";
import { createRazorpayWebhookEventStore } from "./bootstrap/createRazorpayWebhookEventStore.js";
import { createRazorpayWebhookAuditSink } from "./bootstrap/createRazorpayWebhookAuditSink.js";
import { createApp } from "./app.js";

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
    },
  );

const PORT = 3000;

app.listen(PORT, () => {
  console.log(
    `API running on http://localhost:${PORT}`,
  );
});