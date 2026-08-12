import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  BusinessTransactionValidationError,
  DuplicateBusinessTransactionError,
  RuntimeError,
} from "@parmana/runtime";

import {
  PolicyNotFoundError,
  PolicyValidationError,
  SignalValidationError,
} from "@parmana/policy";

import { NonceAlreadyConsumedError } from "@parmana/shared";

/**
 * True for the two body-parser (express.json()) failure shapes every
 * route mounted after the global express.json() middleware can hit
 * before any route handler ever runs: an oversized body
 * ("entity.too.large") and malformed JSON ("entity.parse.failed"),
 * so every route gets the same clean 413/400 instead of falling through
 * to the generic 500 below.
 */
function bodyParserErrorStatus(error: unknown): number | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("type" in error)
  ) {
    return undefined;
  }

  const type = (error as { type?: unknown }).type;

  if (type === "entity.too.large") {
    return 413;
  }

  if (type === "entity.parse.failed") {
    return 400;
  }

  return undefined;
}

/**
 * Centralized API error handler.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  //
  // Malformed / oversized request body (express.json(), before any
  // route handler runs)
  //
  const bodyParserStatus = bodyParserErrorStatus(error);

  if (bodyParserStatus !== undefined) {
    res.status(bodyParserStatus).json({
      error:
        bodyParserStatus === 413
          ? "Payload too large."
          : "Malformed JSON body.",
    });

    return;
  }

  //
  // Request / validation errors
  //
  if (
    error instanceof BusinessTransactionValidationError ||
    error instanceof PolicyValidationError ||
    error instanceof SignalValidationError
  ) {
    res.status(400).json({
      error: error.message,
    });

    return;
  }

  //
  // Missing policy
  //
  if (error instanceof PolicyNotFoundError) {
    res.status(404).json({
      error: error.message,
    });

    return;
  }

  //
  // Duplicate transaction
  //
  if (
    error instanceof DuplicateBusinessTransactionError
  ) {
    res.status(409).json({
      error: error.message,
    });

    return;
  }

  //
  // Execution Gateway rejected a replayed (already-consumed-nonce)
  // authorization. Distinguished from a genuine server error (and from
  // every other Gateway verification failure — forged signature,
  // expired envelope, tampered content — which remain a plain Error and
  // fall through to the generic 500 below, unchanged) so a caller or a
  // monitoring system can tell "this already ran" apart from "something
  // broke" without string-matching a 500 body.
  //
  if (error instanceof NonceAlreadyConsumedError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
    });

    return;
  }

  //
  // Any Runtime exception
  //
  if (error instanceof RuntimeError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
    });

    return;
  }

  //
  // Unexpected failure
  //
  console.error(error);

  res.status(500).json({
    error: "Internal Server Error",
  });
}