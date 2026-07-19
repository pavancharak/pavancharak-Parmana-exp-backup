import express, { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { verifyRazorpayWebhookSignature } from "../webhooks/verifyRazorpayWebhookSignature.js";
import type { RazorpayWebhookEventStore } from "../webhooks/RazorpayWebhookEventStore.js";
import type { RazorpayWebhookAuditSink } from "../webhooks/RazorpayWebhookAuditSink.js";

const SIGNATURE_HEADER = "x-razorpay-signature";
const EVENT_ID_HEADER = "x-razorpay-event-id";
const ROUTE = "/webhooks/razorpay";

/** Generous but bounded: Razorpay's documented webhook payloads are well under this. */
const MAX_BODY_BYTES = 1_000_000;

export interface CreateRazorpayWebhookRouterOptions {
  readonly secret: string;
  readonly eventStore: RazorpayWebhookEventStore;
  readonly auditSink: RazorpayWebhookAuditSink;
}

/**
 * Extracted, narrowly, from a signature-verified payload only — never
 * from an unverified one. Deliberately does not return anything else
 * from `payload`: the payload-handling rule treats the body as
 * untrusted input even post-verification, so nothing beyond these four
 * fields (three of which are optional) ever reaches an audit event or
 * the pending-events store's typed fields.
 */
interface SafeMetadataFields {
  readonly eventType?: string;
  readonly paymentId?: string;
  readonly refundId?: string;
}

/**
 * exactOptionalPropertyTypes (tsconfig.json) treats `key: undefined` as
 * distinct from omitting `key` entirely — object literals below must
 * never assign an optional field the literal value undefined. This
 * conditionally includes each field only when it has a real value.
 */
function withOptionalFields(fields: {
  eventType: string | undefined;
  paymentId: string | undefined;
  refundId: string | undefined;
}): SafeMetadataFields {
  return {
    ...(fields.eventType !== undefined ? { eventType: fields.eventType } : {}),
    ...(fields.paymentId !== undefined ? { paymentId: fields.paymentId } : {}),
    ...(fields.refundId !== undefined ? { refundId: fields.refundId } : {}),
  };
}

function extractSafeMetadata(payload: unknown): {
  eventType: string | undefined;
  paymentId: string | undefined;
  refundId: string | undefined;
} {
  if (typeof payload !== "object" || payload === null) {
    return { eventType: undefined, paymentId: undefined, refundId: undefined };
  }

  const record = payload as Record<string, unknown>;
  const eventType = typeof record.event === "string" ? record.event : undefined;

  const nested = record.payload;
  const nestedRecord = typeof nested === "object" && nested !== null ? (nested as Record<string, unknown>) : undefined;

  const paymentEntity = nestedRecord?.payment;
  const paymentEntityRecord =
    typeof paymentEntity === "object" && paymentEntity !== null ? (paymentEntity as Record<string, unknown>) : undefined;
  const paymentIdCandidate = paymentEntityRecord?.entity;
  const paymentId =
    typeof paymentIdCandidate === "object" && paymentIdCandidate !== null
      ? ((paymentIdCandidate as Record<string, unknown>).id as unknown)
      : undefined;

  const refundEntity = nestedRecord?.refund;
  const refundEntityRecord =
    typeof refundEntity === "object" && refundEntity !== null ? (refundEntity as Record<string, unknown>) : undefined;
  const refundIdCandidate = refundEntityRecord?.entity;
  const refundId =
    typeof refundIdCandidate === "object" && refundIdCandidate !== null
      ? ((refundIdCandidate as Record<string, unknown>).id as unknown)
      : undefined;

  return {
    eventType,
    paymentId: typeof paymentId === "string" ? paymentId : undefined,
    refundId: typeof refundId === "string" ? refundId : undefined,
  };
}

/**
 * Creates the Razorpay webhook router.
 *
 * ORDER IS LAW (mirrors @parmana/envelope-verifier's EnvelopeVerifier
 * verify-then-consume ordering — see that file's comment): signature
 * verification runs first and is entirely side-effect-free. The dedupe
 * store (eventStore.recordIfUnseen, the only side-effecting,
 * consume-exactly-once step) is never touched until AFTER a valid
 * signature and a present event id are both confirmed — an unverified
 * or forged request can never burn a legitimate event id.
 *
 * express.raw() is mounted here, on this router only, ahead of the
 * handler — never on the app's global express.json() (see app.ts,
 * where this router is mounted before that global middleware) — so
 * req.body is the exact wire bytes Razorpay signed, not a
 * re-serialized reconstruction.
 */
export function createRazorpayWebhookRouter(options: CreateRazorpayWebhookRouterOptions): Router {
  const router = Router();

  router.post(
    "/",
    express.raw({ type: "application/json", limit: MAX_BODY_BYTES }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!Buffer.isBuffer(req.body)) {
          res.status(400).json({ error: "Expected an application/json body." });
          return;
        }

        const rawBody: Buffer = req.body;
        const occurredAt = new Date().toISOString();

        const signatureHeader = req.header(SIGNATURE_HEADER);

        if (typeof signatureHeader !== "string" || signatureHeader.length === 0) {
          await options.auditSink.record({
            type: "webhook.rejected",
            occurredAt,
            route: ROUTE,
            reason: "missing signature header",
          });
          res.status(401).json({ error: "Missing signature." });
          return;
        }

        const validSignature = verifyRazorpayWebhookSignature(rawBody, signatureHeader, options.secret);

        if (!validSignature) {
          await options.auditSink.record({
            type: "webhook.rejected",
            occurredAt,
            route: ROUTE,
            reason: "invalid signature",
          });
          res.status(401).json({ error: "Invalid signature." });
          return;
        }

        // Signature verified. Only now is it safe to look at the
        // event id header or parse the payload at all.
        const eventId = req.header(EVENT_ID_HEADER);

        let parsedPayload: unknown;
        try {
          parsedPayload = JSON.parse(rawBody.toString("utf8"));
        } catch {
          parsedPayload = undefined;
        }

        const metadata = extractSafeMetadata(parsedPayload);
        const { eventType } = metadata;

        if (typeof eventId !== "string" || eventId.length === 0) {
          await options.auditSink.record({
            type: "webhook.rejected",
            occurredAt,
            route: ROUTE,
            reason: "missing event id header",
            ...withOptionalFields(metadata),
          });
          res.status(401).json({ error: "Missing event id." });
          return;
        }

        const recorded = await options.eventStore.recordIfUnseen({
          eventId,
          payload: rawBody.toString("utf8"),
          receivedAt: occurredAt,
          ...(eventType !== undefined ? { eventType } : {}),
        });

        if (!recorded) {
          await options.auditSink.record({
            type: "webhook.duplicate",
            occurredAt,
            route: ROUTE,
            eventId,
            ...withOptionalFields(metadata),
          });
          res.status(200).json({ status: "acknowledged" });
          return;
        }

        await options.auditSink.record({
          type: "webhook.received",
          occurredAt,
          route: ROUTE,
          eventId,
          ...withOptionalFields(metadata),
        });

        res.status(200).json({ status: "accepted" });
      } catch (error) {
        next(error);
      }
    },
  );

  // Clean, specific response for an oversized body (express.raw's own
  // limit enforcement) rather than falling through to the generic 500
  // branch in middleware/error-handler.ts.
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      (error as { type?: unknown }).type === "entity.too.large"
    ) {
      res.status(413).json({ error: "Payload too large." });
      return;
    }
    next(error);
  });

  return router;
}
