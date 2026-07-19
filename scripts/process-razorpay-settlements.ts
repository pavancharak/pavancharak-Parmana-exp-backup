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

let currentTick: Promise<void> | undefined;

async function tick(): Promise<void> {
  const summary = await processor!.runOnce();
  console.log({ event: "razorpay_settlement_poll_tick", ...summary });
}

function runTick(): void {
  currentTick = tick()
    .catch((error: unknown) => console.error({ event: "razorpay_settlement_poll_tick_failed", error }))
    .finally(() => {
      currentTick = undefined;
    });
}

console.log({ event: "razorpay_settlement_poll_started", pollIntervalMs: POLL_INTERVAL_MS });

runTick();

const interval = setInterval(runTick, POLL_INTERVAL_MS);

/**
 * Graceful shutdown: stop scheduling new ticks immediately (clearing
 * the interval), then wait for whichever tick is currently in flight —
 * runOnce() itself is idempotent (see RazorpaySettlementProcessor's own
 * comment), so this is a courtesy that finishes cleanly rather than a
 * correctness requirement, but it avoids the container being killed
 * mid-drain and leaving a settlement confirmation half-written.
 */
let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log({ event: "razorpay_settlement_poll_shutdown_started", signal });
  clearInterval(interval);

  Promise.resolve(currentTick)
    .catch(() => {
      // Already logged by runTick's own .catch(); nothing further to do.
    })
    .finally(() => {
      console.log({ event: "razorpay_settlement_poll_shutdown_complete" });
      process.exit(0);
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
