/**
 * Caller-authentication audit trail.
 *
 * Deliberately a separate sink from execution-control's
 * ExecutionAuditSink, not an extension of it: a rejected
 * caller never produces a connectorId, authorizationId, or
 * sessionId (no transaction has been constructed yet), and
 * folding this into that shape would blur the same caller
 * auth / execution authorization boundary this layering is
 * meant to keep sharp. See docs/site/concepts pages on
 * execution authorization and gateway attestation for the
 * two layers this one sits in front of.
 */
export interface CallerAuditEvent {
  readonly type: "caller.authenticated" | "caller.rejected" | "caller.capability_denied";
  readonly occurredAt: string;
  readonly route: string;

  /** Present on "caller.authenticated" and "caller.capability_denied". */
  readonly callerId?: string;

  /**
   * Present on "caller.rejected" and "caller.capability_denied".
   * Never the credential itself.
   */
  readonly reason?: string;

  /**
   * The capability (Business Transaction intent.action) this event
   * concerns. Present only on "caller.capability_denied" — the
   * generic "caller.authenticated" event fires at the caller-auth
   * middleware layer, before any route-specific body is interpreted,
   * so it deliberately stays capability-agnostic; see
   * isCapabilityAllowed.ts and its call sites for where the
   * capability is actually known and checked.
   */
  readonly capability?: string;
}

export interface CallerAuditSink {
  record(event: CallerAuditEvent): Promise<void>;
}
