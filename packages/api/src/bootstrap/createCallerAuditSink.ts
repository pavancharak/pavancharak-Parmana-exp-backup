import { SupabaseClientFactory } from "@parmana/storage";

import { InMemoryCallerAuditSink } from "../auth/InMemoryCallerAuditSink.js";
import { SupabaseCallerAuditSink } from "../auth/SupabaseCallerAuditSink.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";

import { assertSupabaseConfigured } from "./assertSupabaseConfigured.js";

/**
 * Creates the CallerAuditSink used by the caller-auth middleware.
 *
 * Test wiring (NODE_ENV=test): InMemoryCallerAuditSink — mirrors the
 * production/test split createCredentialProvider.ts already
 * established for the vendor-payment connector credential, and now
 * createNonceStore.ts's own split for the same reason.
 *
 * Production: SupabaseCallerAuditSink, a durable audit trail. Closes
 * G-13 (docs/VERIFICATION-GAPS.md): caller-authentication events no
 * longer reset on process restart. Fails closed at startup if
 * Supabase is not configured — never silently falls back to an
 * in-memory sink.
 */
export function createCallerAuditSink(): CallerAuditSink {
  if (process.env.NODE_ENV === "test") {
    return new InMemoryCallerAuditSink();
  }

  assertSupabaseConfigured("CallerAuditSink");

  return new SupabaseCallerAuditSink(SupabaseClientFactory.create());
}
