import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseCallerAuditSink } from "../../src/auth/SupabaseCallerAuditSink.js";
import type { CallerAuditEvent } from "../../src/auth/CallerAuditSink.js";

function createFakeClient(options?: {
  readonly insertError?: { code?: string; message: string };
  readonly onInsert?: (row: Record<string, unknown>) => void;
}): SupabaseClient {
  const client = {
    from(table: string) {
      expect(table).toBe("caller_audit_events");

      return {
        insert(row: Record<string, unknown>) {
          options?.onInsert?.(row);

          if (options?.insertError) {
            return Promise.resolve({ error: options.insertError });
          }

          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return client as unknown as SupabaseClient;
}

const AUTHENTICATED_EVENT: CallerAuditEvent = {
  type: "caller.authenticated",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/execute",
  callerId: "caller-1",
};

const REJECTED_EVENT: CallerAuditEvent = {
  type: "caller.rejected",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/execute",
  reason: "missing credential",
};

describe("SupabaseCallerAuditSink", () => {
  it("resolves on a successful insert", async () => {
    const sink = new SupabaseCallerAuditSink(createFakeClient());

    await expect(sink.record(AUTHENTICATED_EVENT)).resolves.toBeUndefined();
  });

  it("maps CallerAuditEvent fields to row columns, nulling absent optional fields", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseCallerAuditSink(
      createFakeClient({
        onInsert: (row) => {
          capturedRow = row;
        },
      }),
    );

    await sink.record(AUTHENTICATED_EVENT);

    expect(capturedRow).toEqual({
      type: "caller.authenticated",
      occurred_at: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      caller_id: "caller-1",
      reason: null,
    });
  });

  it("maps a rejected event's reason, nulling the absent callerId", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseCallerAuditSink(
      createFakeClient({
        onInsert: (row) => {
          capturedRow = row;
        },
      }),
    );

    await sink.record(REJECTED_EVENT);

    expect(capturedRow).toEqual({
      type: "caller.rejected",
      occurred_at: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      caller_id: null,
      reason: "missing credential",
    });
  });

  it("preserves existing failure semantics: a storage error rejects the returned promise, unchanged from InMemoryCallerAuditSink's contract", async () => {
    const sink = new SupabaseCallerAuditSink(
      createFakeClient({
        insertError: { code: "08006", message: "connection failure" },
      }),
    );

    await expect(sink.record(AUTHENTICATED_EVENT)).rejects.toMatchObject({
      code: "08006",
    });
  });
});
