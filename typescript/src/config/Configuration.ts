/**
 * Parmana SDK
 *
 * Canonical SDK configuration.
 *
 * Configuration defines how the SDK communicates with
 * the Parmana Runtime.
 *
 * Configuration does NOT define:
 * - policy behavior
 * - runtime behavior
 * - authorization rules
 * - execution behavior
 * - verification behavior
 */

import type { RetryPolicy } from "./RetryPolicy.js";
import type { Transport } from "./Transport.js";

/**
 * Immutable SDK configuration.
 *
 * No authentication is enforced by the Parmana Runtime (see
 * docs/CLAIMS.md, "API-layer authentication and authorization") — this
 * configuration has no credentials field for that reason; do not build
 * a client that assumes one.
 */
export interface Configuration {
  /**
   * Parmana Runtime endpoint.
   *
   * Example:
   * https://runtime.example.com
   */
  readonly endpoint: string;

  /**
   * Request timeout (milliseconds).
   *
   * Default:
   * 30000
   */
  readonly timeout?: number;

  /**
   * Retry configuration.
   */
  readonly retryPolicy?: RetryPolicy;

  /**
   * Transport implementation.
   *
   * If omitted, the SDK uses its default HTTP transport.
   */
  readonly transport?: Transport;

  /**
   * Optional SDK user agent.
   */
  readonly userAgent?: string;
}