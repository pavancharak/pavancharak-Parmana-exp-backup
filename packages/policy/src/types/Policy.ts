import type {
  JsonValue,
} from "@parmana/shared";

import type {
  PolicySignals,
} from "./PolicySignals.js";

import {
  PolicyAction,
} from "./PolicyAction.js";

/**
 * Canonical input to the Policy Engine.
 */
export type PolicyInput = PolicySignals;

/**
 * Canonical rule outcome.
 */
export interface PolicyRuleOutcome {
  /**
   * Action produced by the matching rule.
   */
  action: PolicyAction;

  /**
   * Human-readable explanation.
   */
  reason: string;
}

/**
 * Canonical deterministic policy operators.
 *
 * Every operator SHALL:
 * - be deterministic
 * - be side-effect free
 * - operate only on supplied runtime signals
 *
 * Operators SHALL NOT:
 * - access external systems
 * - call LLMs
 * - access databases
 * - perform network requests
 * - use clocks
 * - generate randomness
 */
export type PolicyOperator =

  //
  // Equality
  //
  | "eq"
  | "neq"

  //
  // Numeric
  //
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"

  //
  // Collection
  //
  | "in"
  | "not_in"

  | "contains"
  | "not_contains"

  | "contains_all"
  | "contains_any"

  //
  // String
  //
  | "starts_with"
  | "ends_with"
  | "matches"

  //
  // Existence
  //
  | "exists"
  | "not_exists"

  //
  // Boolean
  //
  | "is_true"
  | "is_false"

  //
  // Null
  //
  | "is_null"
  | "is_not_null"

  //
  // Length
  //
  | "length_eq"
  | "length_gt"
  | "length_gte"
  | "length_lt"
  | "length_lte"

  //
  // Type
  //
  | "type_is";

/**
 * Leaf condition.
 *
 * Example:
 *
 * {
 *   "fact": "amount",
 *   "operator": "lte",
 *   "value": 1000
 * }
 */
export interface PolicyLeafCondition {

  /**
   * Runtime signal name.
   */
  fact: string;

  /**
   * Comparison operator.
   */
  operator: PolicyOperator;

  /**
   * Expected value.
   */
  value?: JsonValue;
}

/**
 * Logical AND.
 *
 * Every child condition must evaluate to true.
 */
export interface PolicyAllCondition {
  all: PolicyCondition[];
}

/**
 * Logical OR.
 *
 * At least one child condition must evaluate to true.
 */
export interface PolicyAnyCondition {
  any: PolicyCondition[];
}

/**
 * Unconditional condition.
 *
 * Always evaluates to true.
 * Typically used as the final fallback rule.
 */
export interface PolicyAlwaysCondition {
  always: true;
}

/**
 * Canonical policy condition.
 *
 * Conditions are recursively composable.
 */
export type PolicyCondition =
  | PolicyLeafCondition
  | PolicyAllCondition
  | PolicyAnyCondition
  | PolicyAlwaysCondition;

/**
 * Single policy rule.
 */
export interface PolicyRule {

  /**
   * Unique rule identifier.
   */
  id: string;

  /**
   * Rule condition.
   */
  condition: PolicyCondition;

  /**
   * Rule outcome.
   */
  outcome: PolicyRuleOutcome;
}

/**
 * Canonical Policy Document.
 */
export interface Policy {

  /**
   * Unique policy identifier.
   */
  policyId: string;

  /**
   * Business policy version.
   */
  policyVersion: string;

  /**
   * Policy language schema version.
   */
  schemaVersion: string;

  /**
   * Human-readable description.
   */
  description?: string;

  /**
   * Declares the runtime signals expected by the policy.
   *
   * Example:
   *
   * {
   *   "amount": "number",
   *   "currency": "string",
   *   "vendorVerified": "boolean"
   * }
   */
  signalsSchema?: Record<string, string>;

  /**
   * Ordered evaluation rules.
   *
   * Rules are evaluated sequentially.
   * The first matching rule wins.
   */
  rules: PolicyRule[];
}