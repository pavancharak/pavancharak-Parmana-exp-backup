import type { NextFunction, Request, Response } from "express";

import type { CallerAuthenticator } from "../auth/CallerAuthenticator.js";
import type { CallerAuditEvent, CallerAuditSink } from "../auth/CallerAuditSink.js";
import { AuditUnavailableError } from "../auth/AuditUnavailableError.js";

/* eslint-disable @typescript-eslint/no-namespace */

/**
 * Minimal local type augmentation, matching the pattern
 * used by @parmana/envelope-verifier's express.ts.
 */
declare global {
  namespace Express {
    interface Request {
      callerId?: string;
    }
  }
}

/* eslint-enable @typescript-eslint/no-namespace */

const BEARER_PREFIX = "Bearer ";

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header || !header.startsWith(BEARER_PREFIX)) return undefined;

  const token = header.slice(BEARER_PREFIX.length).trim();

  return token.length > 0 ? token : undefined;
}

/**
 * Express middleware factory for caller authentication.
 *
 * This is the ONLY layer that decides whether an HTTP
 * request is even entertained. It runs before a Business
 * Transaction is constructed and is entirely independent
 * of policy evaluation (SignedExecutionAuthorization) and
 * gateway attestation, which run later and answer different
 * questions. A rejected caller never reaches either of those
 * layers; a well-authenticated caller submitting a
 * policy-rejected transaction is still rejected by policy,
 * this middleware cannot substitute for it.
 */
/**
 * Records a caller-audit event, failing closed on a write error: logs
 * a structured entry naming the failure, passes AuditUnavailableError
 * to next() so the centralized error handler returns a 503, and
 * returns false so the caller can stop before res.status()/next()
 * (whichever the success path would have done). An action that
 * executes without an audit record contradicts the product's core
 * claim — see AuditUnavailableError's own comment and
 * docs/VERIFICATION-GAPS.md.
 *
 * Deliberately no retry, buffering, or queueing: that would convert
 * fail-closed into eventually-audited, a different design.
 */
async function recordOrFailClosed(
  auditSink: CallerAuditSink,
  event: CallerAuditEvent,
  req: Request,
  next: NextFunction,
): Promise<boolean> {
  try {
    await auditSink.record(event);
    return true;
  } catch (error) {
    console.error({
      event: "caller_audit_write_failed",
      route: req.originalUrl,
      error: error instanceof Error ? error.message : String(error),
    });

    next(new AuditUnavailableError());
    return false;
  }
}

export function createCallerAuthMiddleware(
  authenticator: CallerAuthenticator,
  auditSink: CallerAuditSink,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const credential = extractBearerToken(req.headers.authorization);
    const identity = authenticator.authenticate(credential);

    if (!identity) {
      const recorded = await recordOrFailClosed(
        auditSink,
        {
          type: "caller.rejected",
          occurredAt: new Date().toISOString(),
          route: req.originalUrl,
          reason: credential ? "invalid credential" : "missing credential",
        },
        req,
        next,
      );

      if (!recorded) return;

    res.setHeader(
  "WWW-Authenticate",
  'Bearer realm="Parmana"',
);

res.status(401).json({
  error: "authentication required",
});

return;

    req.callerId = identity.callerId;

    const recorded = await recordOrFailClosed(
      auditSink,
      {
        type: "caller.authenticated",
        occurredAt: new Date().toISOString(),
        route: req.originalUrl,
        callerId: identity.callerId,
      },
      req,
      next,
    );

    if (!recorded) return;

    next();
  };
}
