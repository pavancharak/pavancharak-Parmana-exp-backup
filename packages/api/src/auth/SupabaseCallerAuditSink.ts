import type { SupabaseClient } from "@supabase/supabase-js";

import { AuditEventCrypto } from "@parmana/crypto";

import type { CallerAuditEvent, CallerAuditSink } from "./CallerAuditSink.js";

/**
 * Durable, Supabase-backed CallerAuditSink. Closes G-13
 * (docs/VERIFICATION-GAPS.md) for the caller-authentication audit
 * trail: events now survive a process restart instead of living only
 * in InMemoryCallerAuditSink's process-local array (still the correct
 * choice for tests — see
 * packages/api/src/bootstrap/createCallerAuditSink.js).
 *
 * Signed at write time (audit-sink signing milestone, following
 * RFC-0021's Refusal Records): a plain durable row could previously
 * be altered by anyone with database access with no way to detect
 * it. Signs the event exactly as given, before any storage-only
 * field (insert timestamp, row id) is added — the same discipline
 * VerificationCrypto/RefusalCrypto already apply. Uses the same
 * signing stack and key (DEFAULT_KEY_ID) as every other signed
 * artifact in this codebase; see AuditEventCrypto.
 *
 * Failure semantics: unchanged from InMemoryCallerAuditSink. record()
 * has always been an unguarded `await` in
 * middleware/caller-auth.ts — that call site has no try/catch today,
 * and this class does not add one. A write failure here rejects the
 * returned promise exactly like any other failed Supabase insert
 * elsewhere in this codebase (SupabaseBusinessTransactionRepository,
 * SupabaseExecutionTrustRecordRepository); it is the caller's
 * existing behavior, unmodified by this class, that decides what
 * happens next. See docs/VERIFICATION-GAPS.md G-13 for why this is
 * documented rather than changed in this session.
 */
export class SupabaseCallerAuditSink implements CallerAuditSink {
  private readonly crypto = new AuditEventCrypto();

  constructor(private readonly client: SupabaseClient) {}

  async record(event: CallerAuditEvent): Promise<void> {
    const signature = await this.crypto.sign(event);

    const { error } = await this.client
      .from("caller_audit_events")
      .insert({
        type: event.type,
        occurred_at: event.occurredAt,
        route: event.route,
        caller_id: event.callerId ?? null,
        reason: event.reason ?? null,
        signature_json: signature,
      });

    if (error) {
      throw error;
    }
  }
}
