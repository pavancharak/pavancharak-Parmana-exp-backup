import type { ExecutionTrustRecordRepository } from "@parmana/shared";

import { createRazorpayConnector } from "./createRazorpayConnector.js";
import { createRazorpayCredentialProvider } from "./createRazorpayCredentialProvider.js";

import { RazorpaySettlementProcessor } from "../webhooks/RazorpaySettlementProcessor.js";
import type { RazorpayWebhookEventStore } from "../webhooks/RazorpayWebhookEventStore.js";
import type { RazorpayWebhookAuditSink } from "../webhooks/RazorpayWebhookAuditSink.js";

/**
 * Creates the RazorpaySettlementProcessor (M4b), or undefined when
 * settlement processing cannot run at all — mirrors
 * createConnectorRegistry.ts's fail-closed shape: no Razorpay
 * credential configured means no connector to fetch-verify with, so
 * there is nothing for a processor to do.
 *
 * Reuses createRazorpayConnector.ts / createRazorpayCredentialProvider.ts
 * unchanged — the exact same connector/credential wiring POST /execute's
 * razorpay:refund-create path already uses, so fetch-verify authenticates
 * identically to every other Razorpay call this codebase makes.
 */
export function createRazorpaySettlementProcessor(options: {
  readonly eventStore: RazorpayWebhookEventStore;
  readonly trustRecords: ExecutionTrustRecordRepository;
  readonly auditSink: RazorpayWebhookAuditSink;
}): RazorpaySettlementProcessor | undefined {
  const credentialProvider = createRazorpayCredentialProvider();

  if (credentialProvider === undefined) {
    return undefined;
  }

  return new RazorpaySettlementProcessor({
    eventStore: options.eventStore,
    trustRecords: options.trustRecords,
    auditSink: options.auditSink,
    connector: createRazorpayConnector(),
    credentialProvider,
  });
}
