import {
  ErrorCode,
  ParmanaError,
} from "./ParmanaError.js";

/**
 * Raised when the Runtime returns HTTP 403: the caller is
 * authenticated, but is not permitted to assert the specific
 * authority.principalId on this request (isPrincipalAllowed,
 * packages/api/src/routes/execute.ts and transactions.ts). Distinct
 * from AuthenticationError (401, no valid credential at all) — this is
 * "who you are is known; you can't act as this principal."
 */
export class AuthorizationError extends ParmanaError {
  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super({
      code: ErrorCode.AUTHORIZATION_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "AuthorizationError";
  }
}
