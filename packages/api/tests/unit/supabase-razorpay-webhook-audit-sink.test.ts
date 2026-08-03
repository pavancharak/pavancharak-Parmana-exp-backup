import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Pool } from "pg";

import { AuditEventCrypto } from "@parmana/crypto";

import { SupabaseRazorpayWebhookAuditSink } from "../../src/webhooks/SupabaseRazorpayWebhookAuditSink.js";
import type { RazorpayWebhookAuditEvent } from "../../src/webhooks/RazorpayWebhookAuditSink.js";

//
// Hermetic key material, matching supabase-caller-audit-sink.test.ts's
// own convention.
//
let keyDir: string;
let previousKeyDir: string | undefined;

beforeEach(() => {
  keyDir = mkdtempSync(join(tmpdir(), "parmana-webhook-audit-sink-keys-"));

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  writeFileSync(
    join(keyDir, "default.private.pem"),
    privateKey.export({ format: "pem", type: "pkcs8" }),
  );

  writeFileSync(
    join(keyDir, "default.public.pem"),
    publicKey.export({ format: "pem", type: "spki" }),
  );

  previousKeyDir = process.env.PARMANA_KEY_DIR;
  process.env.PARMANA_KEY_DIR = keyDir;
});

afterEach(() => {
  if (previousKeyDir === undefined) {
    delete process.env.PARMANA_KEY_DIR;
  } else {
    process.env.PARMANA_KEY_DIR = previousKeyDir;
  }

  rmSync(keyDir, { recursive: true, force: true });
});

function createFakePool(options?: {
  readonly insertError?: { code?: string; message: string };
  readonly onInsert?: (values: readonly unknown[]) => void;
}): Pool {
  const pool = {
    query(sql: string, values: readonly unknown[]) {
      expect(sql).toContain("INSERT INTO razorpay_webhook_audit_events");

      options?.onInsert?.(values);

      if (options?.insertError) {
        return Promise.reject(options.insertError);
      }

      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };

  return pool as unknown as Pool;
}

/**
 * Maps the positional $1.. values SupabaseRazorpayWebhookAuditSink
 * passes to pool.query() back to named columns, in the same order as
 * INSERT_RAZORPAY_WEBHOOK_AUDIT_EVENT_SQL, for readable assertions.
 */
function toRow(values: readonly unknown[]): Record<string, unknown> {
  const [
    type,
    occurred_at,
    route,
    event_id,
    event_type,
    payment_id,
    refund_id,
    reason,
    severity,
    confirmation_id,
    fetched_refund_status,
    signature_json_raw,
  ] = values;

  return {
    type,
    occurred_at,
    route,
    event_id,
    event_type,
    payment_id,
    refund_id,
    reason,
    severity,
    confirmation_id,
    fetched_refund_status,
    signature_json: JSON.parse(signature_json_raw as string),
  };
}

const REJECTED_EVENT: RazorpayWebhookAuditEvent = {
  type: "webhook.rejected",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/webhooks/razorpay",
  reason: "signature mismatch",
};

const SETTLEMENT_FAILED_EVENT: RazorpayWebhookAuditEvent = {
  type: "settlement.failed",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/webhooks/razorpay",
  eventId: "evt-1",
  eventType: "refund.processed",
  refundId: "rfnd_1",
  severity: "flagged",
  confirmationId: "conf-1",
  fetchedRefundStatus: "failed",
};

describe("SupabaseRazorpayWebhookAuditSink", () => {
  it("resolves on a successful insert", async () => {
    const sink = new SupabaseRazorpayWebhookAuditSink(createFakePool());

    await expect(sink.record(REJECTED_EVENT)).resolves.toBeUndefined();
  });

  it("maps a rejected webhook event to query params, nulling absent optional fields, and signs it", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseRazorpayWebhookAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(REJECTED_EVENT);

    expect(capturedRow).toEqual({
      type: "webhook.rejected",
      occurred_at: "2026-01-01T00:00:00.000Z",
      route: "/webhooks/razorpay",
      event_id: null,
      event_type: null,
      payment_id: null,
      refund_id: null,
      reason: "signature mismatch",
      severity: null,
      confirmation_id: null,
      fetched_refund_status: null,
      signature_json: {
        algorithm: "ed25519",
        keyId: "default",
        value: expect.any(String),
        signedAt: expect.any(String),
      },
    });
  });

  it("maps a flagged settlement-failed event's full field set", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseRazorpayWebhookAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(SETTLEMENT_FAILED_EVENT);

    expect(capturedRow).toMatchObject({
      type: "settlement.failed",
      event_id: "evt-1",
      event_type: "refund.processed",
      refund_id: "rfnd_1",
      severity: "flagged",
      confirmation_id: "conf-1",
      fetched_refund_status: "failed",
    });
    expect(capturedRow!.signature_json).toBeDefined();
  });

  it("preserves existing failure semantics: a storage error rejects the returned promise", async () => {
    const sink = new SupabaseRazorpayWebhookAuditSink(
      createFakePool({
        insertError: { code: "08006", message: "connection failure" },
      }),
    );

    await expect(sink.record(REJECTED_EVENT)).rejects.toMatchObject({
      code: "08006",
    });
  });

  it("signs each event so it verifies against its own canonical bytes, and a tampered event fails verification", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseRazorpayWebhookAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(SETTLEMENT_FAILED_EVENT);

    const crypto = new AuditEventCrypto();
    const signature = capturedRow!.signature_json as {
      algorithm: "ed25519";
      keyId: string;
      value: string;
      signedAt: Date;
    };

    await expect(
      crypto.verify(SETTLEMENT_FAILED_EVENT, signature),
    ).resolves.toBe(true);

    // Tampered: flips the outcome a third party would care about
    // most -- "failed" silently rewritten to "confirmed" after the
    // fact, exactly the kind of alteration signing exists to catch.
    const tamperedEvent: RazorpayWebhookAuditEvent = {
      ...SETTLEMENT_FAILED_EVENT,
      type: "settlement.confirmed",
      fetchedRefundStatus: "processed",
      severity: undefined,
    };

    await expect(
      crypto.verify(tamperedEvent, signature),
    ).resolves.toBe(false);
  });
});
