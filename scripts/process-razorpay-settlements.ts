import "dotenv/config";

import { createRazorpaySettlementProcessor } from "../packages/api/src/bootstrap/createRazorpaySettlementProcessor.js";
import { createRazorpayWebhookEventStore } from "../packages/api/src/bootstrap/createRazorpayWebhookEventStore.js";
import { createRazorpayWebhookAuditSink } from "../packages/api/src/bootstrap/createRazorpayWebhookAuditSink.js";
import { executionTrustRecordRepository } from "../packages/api/src/repositories.js";

/**
 * M4b out-of-band settlement processing: a poll loop, not a new queue.
 * This codebase has no job-queue/cron dependency (see docs/CLAIMS.md),
 * so the simplest pattern consistent with what already exists is a
 * setInterval calling RazorpaySettlementProcessor.runOnce() — the same
 * method the test suite calls directly and deterministically. Each
 * runOnce() drain is itself idempotent (see that class's own comment),
 * so overlapping/retried runs are always safe.
 */
const POLL_INTERVAL_MS = Number(process.env.RAZORPAY_SETTLEMENT_POLL_INTERVAL_MS ?? 15_000);

const processor = createRazorpaySettlementProcessor({
  eventStore: createRazorpayWebhookEventStore(),
  trustRecords: executionTrustRecordRepository,
  auditSink: createRazorpayWebhookAuditSink(),
});

if (processor === undefined) {
  console.warn({
    event: "razorpay_settlement_processor_unavailable",
    reason: "Razorpay credentials are not configured; no settlement processing will run.",
  });
  process.exit(0);
}

async function tick(): Promise<void> {
  const summary = await processor!.runOnce();
  console.log({ event: "razorpay_settlement_poll_tick", ...summary });
}

console.log({ event: "razorpay_settlement_poll_started", pollIntervalMs: POLL_INTERVAL_MS });

tick().catch((error: unknown) => console.error({ event: "razorpay_settlement_poll_tick_failed", error }));

setInterval(() => {
  tick().catch((error: unknown) => console.error({ event: "razorpay_settlement_poll_tick_failed", error }));
}, POLL_INTERVAL_MS);
