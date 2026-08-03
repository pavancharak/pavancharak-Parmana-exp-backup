import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { PostgresPoolFactory, SupabaseClientFactory } from "@parmana/storage";

import { SupabaseCallerAuditSink } from "../../src/auth/SupabaseCallerAuditSink.js";
import type { CallerAuditEvent } from "../../src/auth/CallerAuditSink.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate("Supabase Caller Audit Sink");

/**
 * Closes G-13 (docs/VERIFICATION-GAPS.md): proves the caller-audit
 * trail is durable against a real database. CallerAuditSink's own
 * interface is write-only (record(): Promise<void>, no read method),
 * so persistence is verified here by querying caller_audit_events
 * directly through the raw Supabase client — the same thing an
 * operator investigating an incident after a restart would do.
 * Requires the caller_audit_events table from
 * supabase/migrations/20260718090000_add_nonce_and_caller_audit_
 * tables.sql to have been applied to the target project.
 *
 * TEMPORARY: the writing side goes through PostgresPoolFactory
 * (DATABASE_URL), not SupabaseClientFactory — see
 * SupabaseCallerAuditSink for why (PostgREST schema-cache workaround,
 * Supabase ticket SU-437429). The reading side stays on
 * SupabaseClientFactory deliberately: it also proves PostgREST can
 * still see a row this suite wrote by bypassing it.
 */
describe.skipIf(!databaseConfigured)("SupabaseCallerAuditSink (live)", () => {
  it("records an event that a fresh client against the same backing can read back", async () => {
    const route = `/test-${crypto.randomUUID()}`;

    const event: CallerAuditEvent = {
      type: "caller.authenticated",
      occurredAt: new Date().toISOString(),
      route,
      callerId: "integration-test-caller",
    };

    const sink = new SupabaseCallerAuditSink(PostgresPoolFactory.create());

    await sink.record(event);

    // A fresh client, standing in for a fresh process — proves the
    // row survives independently of the writer's own client/process.
    const readingClient = SupabaseClientFactory.create();

    const { data, error } = await readingClient
      .from("caller_audit_events")
      .select("*")
      .eq("route", route)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.type).toBe("caller.authenticated");
    expect(data!.route).toBe(route);
    expect(data!.caller_id).toBe("integration-test-caller");
    expect(data!.reason).toBeNull();
  });

  it("records a rejected event with a reason and a null callerId", async () => {
    const route = `/test-${crypto.randomUUID()}`;

    const event: CallerAuditEvent = {
      type: "caller.rejected",
      occurredAt: new Date().toISOString(),
      route,
      reason: "missing credential",
    };

    const sink = new SupabaseCallerAuditSink(PostgresPoolFactory.create());

    await sink.record(event);

    const readingClient = SupabaseClientFactory.create();

    const { data, error } = await readingClient
      .from("caller_audit_events")
      .select("*")
      .eq("route", route)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data!.type).toBe("caller.rejected");
    expect(data!.caller_id).toBeNull();
    expect(data!.reason).toBe("missing credential");
  });
});
