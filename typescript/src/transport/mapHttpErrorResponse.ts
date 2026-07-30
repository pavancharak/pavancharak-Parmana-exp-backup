/**
 * Parmana SDK
 *
 * Maps a non-2xx HTTP response from the Parmana Runtime to the
 * corresponding typed SDK error.
 *
 * The real Runtime envelope (packages/api/src/middleware/error-handler.ts)
 * is `{ "error": string }`, sometimes with a second `code` field. `code`
 * is present only when the failure reached the shared error handler as a
 * typed error carrying its own status/code (RuntimeError, or a
 * ParmanaError subclass such as NonceAlreadyConsumedError); most 4xx
 * responses carry no `code` at all. Classification below is therefore
 * driven primarily by HTTP status, with `code` used only to distinguish
 * the one case that needs it: a policy REJECTED decision now carries its
 * own dedicated 403 with `code: "POLICY_DENIED"`, checked ahead of the
 * generic status-based branches so it doesn't collide with the *other*
 * 403 this API returns (a caller-identity/principal mismatch, which
 * carries no `code` field at all and correctly stays an
 * AuthorizationError). See /api-reference/error-catalog for the
 * exhaustive, real, verified list this mapping is built from.
 *
 * Previously, a policy rejection had no dedicated status of its own and
 * fell through to a generic `500` with `code: "RUNTIME_ERROR"` — this
 * function used to special-case exactly that shape to still produce an
 * ExecutionRejectedError. That gap is now fixed at the source
 * (packages/runtime/src/ExecutionGate.ts, packages/api/src/middleware/
 * error-handler.ts); this mapping was updated to match, not to work
 * around the old ambiguity.
 *
 * One route, POST /policies/validate, does not use this envelope at all
 * (every status it returns is `{valid, errors}`); PolicyApi.validate
 * opts out of this mapping entirely via TransportRequest.throwOnHttpError,
 * so this function is never called for that route's responses.
 */

import { ValidationError } from "../errors/ValidationError.js";
import { AuthenticationError } from "../errors/AuthenticationError.js";
import { AuthorizationError } from "../errors/AuthorizationError.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { ConflictError } from "../errors/ConflictError.js";
import { ExecutionRejectedError } from "../errors/ExecutionRejectedError.js";
import { InternalServerError } from "../errors/InternalServerError.js";
import type { ParmanaError } from "../errors/ParmanaError.js";

interface ErrorEnvelope {
  readonly error?: unknown;
  readonly code?: unknown;
}

function extractMessage(status: number, body: unknown): string {
  if (
    body !== null &&
    typeof body === "object" &&
    "error" in body
  ) {
    const message = (body as ErrorEnvelope).error;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return `Request failed with status ${status}.`;
}

function extractCode(body: unknown): string | undefined {
  if (
    body !== null &&
    typeof body === "object" &&
    "code" in body
  ) {
    const code = (body as ErrorEnvelope).code;

    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

/**
 * Maps a non-2xx HTTP response to the typed SDK error it should be
 * thrown as.
 */
export function mapHttpErrorResponse(
  status: number,
  body: unknown,
): ParmanaError {
  const message = extractMessage(status, body);
  const code = extractCode(body);

  // Checked ahead of the generic status branches: a policy REJECTED
  // decision carries this exact code alongside its 403 status, and must
  // not be classified as the *other* 403 this API returns (a
  // caller-identity/principal mismatch, which carries no code at all).
  if (code === "POLICY_DENIED") {
    return new ExecutionRejectedError(message);
  }

  if (status === 400) {
    return new ValidationError(message);
  }

  if (status === 401) {
    return new AuthenticationError(message);
  }

  if (status === 403) {
    return new AuthorizationError(message);
  }

  if (status === 404) {
    return new NotFoundError(message);
  }

  if (status === 409) {
    return new ConflictError(message);
  }

  return new InternalServerError(message);
}
