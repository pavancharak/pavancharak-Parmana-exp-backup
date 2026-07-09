import type { ExecutionSystem } from "@parmana/execution-system";

/**
 * Production Execution Gateway bootstrap.
 *
 * This is the composition root for execution governance.
 * It will eventually construct and configure:
 *
 * - Gateway public key
 * - Nonce store
 * - Connector registry
 * - Execution Control
 * - Connector routing
 * - ExecutionGateway
 */
export function createExecutionGateway(): ExecutionSystem {
  throw new Error(
    "Production ExecutionGateway bootstrap is not implemented.",
  );
}