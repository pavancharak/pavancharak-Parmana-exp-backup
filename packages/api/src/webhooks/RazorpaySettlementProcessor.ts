import { randomUUID } from "node:crypto";

import type { ExecutionTrustRecordRepository } from "@parmana/shared";
import { SettlementStatus, type SettlementConfirmation } from "@parmana/shared";
import { SettlementConfirmationCrypto } from "@parmana/crypto";
import {
  PARMANA_TXN_NOTES_KEY,
  RAZORPAY_REFUND_FETCH_CAPABILITY,
  type Connector,
  type CredentialProvider,
} from "@parmana/connector-sdk";

import type { RazorpayWebhookEventStore } from "./RazorpayWebhookEventStore.js";
import type { RazorpayWebhookAuditSink } from "./RazorpayWebhookAuditSink.js";
import type { PendingRazorpayWebhookEvent } from "./RazorpayWebhookTypes.js";

const ROUTE = "/webhooks/razorpay";
const RELEVANT_EVENT_TYPES = new Set(["refund.processed", "refund.failed"]);
const DEFAULT_MAX_PARK_ATTEMPTS = 5;
const FETCH_VERIFY_TIMEOUT_MS = 10_000;

export interface RazorpaySettlementProcessorOptions {
  readonly eventStore: RazorpayWebhookEventStore;
  readonly trustRecords: ExecutionTrustRecordRepository;
  readonly auditSink: RazorpayWebhookAuditSink;
  readonly connector: Connector;
  readonly credentialProvider: CredentialProvider;
  /** Bounded park-retry window, in attempts (not wall-clock time — see class comment). Default 5. */
  readonly maxParkAttempts?: number;
}

export interface RazorpaySettlementRunSummary {
  readonly confirmed: number;
  readonly parked: number;
  readonly ignored: number;
  readonly failed: number;
}

type ParsedRefundEventPayload = {
  readonly eventType: string | undefined;
  readonly razorpayRefundId: string | undefined;
  readonly businessTransactionId: string | undefined;
};

/**
 * Drains M4a's RazorpayWebhookEventStore into signed Settlement
 * Confirmations. Out-of-band from the webhook request cycle by design —
 * M4a's 200 has already returned by the time this runs.
 *
 * Processing trigger (the "simplest pattern consistent with the
 * codebase" this milestone's scope calls for): this class exposes
 * runOnce(), a single idempotent drain of every stored event. No new
 * queue infrastructure — this codebase has none today (no cron, no job
 * queue dependency; see docs/CLAIMS.md). Production wiring is a thin
 * poll loop (scripts/process-razorpay-settlements.ts) that calls
 * runOnce() on a setInterval; tests call runOnce() (or processEvent()
 * directly) as many times as they need, deterministically, with no
 * timers involved.
 *
 * Idempotency has two independent layers, matching the two failure
 * modes a re-run must survive:
 *   1. Durable: before doing anything for an event, this checks whether
 *      the correlated Trust Record already has a SettlementConfirmation
 *      referencing that event id (ExecutionTrustRecordRepository is the
 *      single source of truth) — safe even after a process restart.
 *   2. In-process: park-retry attempt counts live only in memory
 *      (this.parkAttempts), not persisted. Resetting on restart is
 *      intentional and safe: a parked event simply gets a fresh
 *      attempt budget, and layer 1 above prevents ever producing a
 *      second confirmation for an event already resolved.
 */
export class RazorpaySettlementProcessor {
  private readonly crypto = new SettlementConfirmationCrypto();
  private readonly parkAttempts = new Map<string, number>();
  private readonly resolved = new Set<string>();

  constructor(private readonly options: RazorpaySettlementProcessorOptions) {}

  async runOnce(): Promise<RazorpaySettlementRunSummary> {
    const events = await this.options.eventStore.listAll();

    let confirmed = 0;
    let parked = 0;
    let ignored = 0;
    let failed = 0;

    for (const event of events) {
      const outcome = await this.processEvent(event);
      if (outcome === "confirmed") confirmed++;
      else if (outcome === "parked") parked++;
      else if (outcome === "ignored" || outcome === "already-resolved") ignored++;
      else failed++;
    }

    return { confirmed, parked, ignored, failed };
  }

  /**
   * Processes a single stored event. Exposed directly (not just via
   * runOnce()) so tests can drive one event's lifecycle precisely
   * without needing every other stored event to also be well-formed.
   */
  async processEvent(
    event: PendingRazorpayWebhookEvent,
  ): Promise<"confirmed" | "parked" | "ignored" | "failed" | "already-resolved"> {
    if (this.resolved.has(event.eventId)) {
      return "already-resolved";
    }

    const parsed = this.parsePayload(event);

    if (parsed.eventType === undefined || !RELEVANT_EVENT_TYPES.has(parsed.eventType)) {
      // Other event types: acknowledged in store as ignored, audited,
      // never an error. Audited once — this.resolved stops it being
      // re-audited on every subsequent runOnce() poll.
      await this.options.auditSink.record({
        type: "webhook.rejected",
        occurredAt: new Date().toISOString(),
        route: ROUTE,
        eventId: event.eventId,
        ...(parsed.eventType !== undefined ? { eventType: parsed.eventType } : {}),
        reason: "event type not relevant to settlement (ignored, not an error)",
      });
      this.resolved.add(event.eventId);
      return "ignored";
    }

    if (parsed.razorpayRefundId === undefined || parsed.businessTransactionId === undefined) {
      await this.options.auditSink.record({
        type: "settlement.failed",
        occurredAt: new Date().toISOString(),
        route: ROUTE,
        eventId: event.eventId,
        eventType: parsed.eventType,
        severity: "flagged",
        reason: "verified payload did not carry an extractable refund id and/or parmana transaction id",
      });
      this.resolved.add(event.eventId);
      return "failed";
    }

    const businessTransactionId = parsed.businessTransactionId;
    const razorpayRefundId = parsed.razorpayRefundId;

    // CORRELATION
    const trustRecord = await this.options.trustRecords.findByTransactionId(businessTransactionId);

    if (trustRecord === null) {
      return this.park(event, parsed, "trust record not found yet — parking (webhook can legitimately arrive before the synchronous execution path finishes writing)");
    }

    // Durable idempotency: already settled by an earlier run?
    if (trustRecord.settlementConfirmations?.some((c) => c.webhookEventId === event.eventId)) {
      this.resolved.add(event.eventId);
      return "already-resolved";
    }

    // FETCH-VERIFY: the webhook is a doorbell, not a delivery.
    let fetchedRefund: { status?: unknown } | undefined;
    try {
      const credential = await this.options.credentialProvider.resolve("razorpay");
      const response = await this.options.connector.execute(
        {
          capability: RAZORPAY_REFUND_FETCH_CAPABILITY,
          businessTransactionId: `${businessTransactionId}:settlement-fetch-verify`,
          action: RAZORPAY_REFUND_FETCH_CAPABILITY,
          target: `refunds/${razorpayRefundId}`,
          parameters: { refundId: razorpayRefundId },
        },
        {
          credential,
          timeoutMs: FETCH_VERIFY_TIMEOUT_MS,
          requestedAt: new Date(),
        },
      );
      fetchedRefund = (response.metadata as { refund?: { status?: unknown } } | undefined)?.refund;
    } catch {
      return this.park(event, parsed, "fetch-verify call to Razorpay failed or was unreachable");
    }

    const fetchedRefundStatus = typeof fetchedRefund?.status === "string" ? fetchedRefund.status : undefined;

    if (fetchedRefundStatus === undefined) {
      return this.park(event, parsed, "fetch-verify response did not carry a usable refund status");
    }

    // The FETCHED state wins — never the webhook's own claimed event type.
    const status = fetchedRefundStatus === "processed" ? SettlementStatus.SETTLED : SettlementStatus.SETTLEMENT_FAILED;

    const receiptId = trustRecord.receipts.at(-1)?.receiptId;

    const confirmation: SettlementConfirmation = await this.crypto.createConfirmation({
      confirmationId: randomUUID(),
      businessTransactionId,
      webhookEventId: event.eventId,
      razorpayRefundId,
      status,
      fetchedRefundStatus,
      issuedAt: new Date(),
      ...(receiptId !== undefined ? { receiptId } : {}),
    });

    await this.options.trustRecords.appendSettlementConfirmation(businessTransactionId, confirmation);

    await this.options.auditSink.record({
      type: status === SettlementStatus.SETTLED ? "settlement.confirmed" : "settlement.failed",
      occurredAt: new Date().toISOString(),
      route: ROUTE,
      eventId: event.eventId,
      eventType: parsed.eventType,
      refundId: razorpayRefundId,
      confirmationId: confirmation.confirmationId,
      fetchedRefundStatus,
      ...(status === SettlementStatus.SETTLEMENT_FAILED ? { severity: "flagged" as const } : {}),
    });

    this.parkAttempts.delete(event.eventId);
    this.resolved.add(event.eventId);

    return "confirmed";
  }

  private async park(
    event: PendingRazorpayWebhookEvent,
    parsed: ParsedRefundEventPayload,
    reason: string,
  ): Promise<"parked" | "failed"> {
    const attempts = (this.parkAttempts.get(event.eventId) ?? 0) + 1;
    this.parkAttempts.set(event.eventId, attempts);

    const maxAttempts = this.options.maxParkAttempts ?? DEFAULT_MAX_PARK_ATTEMPTS;

    if (attempts > maxAttempts) {
      await this.options.auditSink.record({
        type: "settlement.park_exhausted",
        occurredAt: new Date().toISOString(),
        route: ROUTE,
        eventId: event.eventId,
        ...(parsed.eventType !== undefined ? { eventType: parsed.eventType } : {}),
        severity: "flagged",
        reason: `${reason} (park window exhausted after ${attempts} attempts)`,
      });
      this.resolved.add(event.eventId);
      this.parkAttempts.delete(event.eventId);
      return "failed";
    }

    await this.options.auditSink.record({
      type: "settlement.parked",
      occurredAt: new Date().toISOString(),
      route: ROUTE,
      eventId: event.eventId,
      ...(parsed.eventType !== undefined ? { eventType: parsed.eventType } : {}),
      reason: `${reason} (attempt ${attempts}/${maxAttempts})`,
    });

    return "parked";
  }

  private parsePayload(event: PendingRazorpayWebhookEvent): ParsedRefundEventPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.payload);
    } catch {
      return { eventType: event.eventType, razorpayRefundId: undefined, businessTransactionId: undefined };
    }

    const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const eventType = event.eventType ?? (typeof record.event === "string" ? record.event : undefined);

    const payload = record.payload;
    const payloadRecord = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : undefined;

    const refund = payloadRecord?.refund;
    const refundRecord = typeof refund === "object" && refund !== null ? (refund as Record<string, unknown>) : undefined;

    const entity = refundRecord?.entity;
    const entityRecord = typeof entity === "object" && entity !== null ? (entity as Record<string, unknown>) : undefined;

    const razorpayRefundId = typeof entityRecord?.id === "string" ? entityRecord.id : undefined;

    const notes = entityRecord?.notes;
    const notesRecord = typeof notes === "object" && notes !== null ? (notes as Record<string, unknown>) : undefined;
    const businessTransactionIdCandidate = notesRecord?.[PARMANA_TXN_NOTES_KEY];
    const businessTransactionId = typeof businessTransactionIdCandidate === "string" ? businessTransactionIdCandidate : undefined;

    return { eventType, razorpayRefundId, businessTransactionId };
  }
}
