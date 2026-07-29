/**
 * Parmana SDK
 *
 * Maps a non-2xx HTTP response from the Parmana Runtime to the
 * corresponding typed SDK error.
 *
 * The real Runtime envelope (packages/api/src/middleware/error-handler.ts)
 * is `{ "error": string }`, sometimes with a second `code` field. `code`
 * is present only when the failure reached the shared error handler as a
 * typed RuntimeError subclass; most 4xx responses carry no `code` at all.
 * Classification below is therefore driven primarily by HTTP status, with
 * `code` used only to distinguish the one case that needs it (a policy
 * REJECTED decision, surfaced as a 500 with code RUNTIME_ERROR). See
 * /api-reference/error-catalog for the exhaustive, real, verified list
 * this mapping is built from.
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

  if (
    code === "RUNTIME_ERROR" &&
    message.startsWith("Execution rejected")
  ) {
    return new ExecutionRejectedError(message);
  }

  return new InternalServerError(message);
}
