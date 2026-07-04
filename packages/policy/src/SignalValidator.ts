import type {
  PolicySignals,
} from "./types/PolicySignals.js";

import {
  SignalValidationError,
} from "./errors/SignalValidationError.js";

/**
 * Canonical Signal Validator.
 *
 * Responsibilities
 * ----------------
 * - Validate runtime signal container.
 * - Ensure signals are structurally valid.
 *
 * This validator does NOT
 * - validate policy rules
 * - validate operators
 * - evaluate policies
 * - perform type checking against a policy
 */
export class SignalValidator {

  /**
   * Validate runtime signals.
   *
   * Throws if signals are invalid.
   */
  public validate(
    signals: PolicySignals,
  ): void {

    if (signals == null) {
      throw new SignalValidationError(
        "Policy signals are required.",
      );
    }

    if (typeof signals !== "object") {
      throw new SignalValidationError(
        "Policy signals must be an object.",
      );
    }

    if (Array.isArray(signals)) {
      throw new SignalValidationError(
        "Policy signals cannot be an array.",
      );
    }

    //
    // Validate signal names.
    //
    for (const [key] of Object.entries(signals)) {

      if (!key.trim()) {
        throw new SignalValidationError(
          "Signal names cannot be empty.",
        );
      }
    }
  }
}