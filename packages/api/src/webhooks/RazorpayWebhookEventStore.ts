import type { PendingRazorpayWebhookEvent } from "./RazorpayWebhookTypes.js";

/**
 * Durable, consume-exactly-once store for verified Razorpay webhook
 * events, keyed on eventId (X-Razorpay-Event-Id). Mirrors
 * @parmana/envelope-verifier's NonceStore.checkAndRecord exactly: a
 * single atomic call does double duty as both "is this a replay?" and
 * "persist it" — there is no separate check-then-set, so there is no
 * race window between the two.
 *
 * Recording here is the end of this session's scope (M4a). Nothing
 * reads these rows back to actually process a settlement/refund
 * lifecycle change — that is M4b (see docs/CLAIMS.md).
 */
export interface RazorpayWebhookEventStore {
  /**
   * Atomically persists the event if its eventId is unseen.
   *
   * Returns true if this call recorded it (fresh — the caller should
   * treat it as newly accepted). Returns false if it was already
   * recorded (a replay/duplicate delivery — the caller MUST
   * acknowledge without persisting or reprocessing it again).
   */
  recordIfUnseen(event: PendingRazorpayWebhookEvent): Promise<boolean>;

  /**
   * Lists every verified, deduplicated event recorded so far — M4b's
   * settlement processor drains this to find work. Idempotency of
   * processing itself is NOT this store's job: a processor must check
   * (via ExecutionTrustRecordRepository) whether a given event id
   * already produced a SettlementConfirmation before acting on it
   * again, since this list includes events already fully processed in
   * an earlier run.
   */
  listAll(): Promise<readonly PendingRazorpayWebhookEvent[]>;
}
