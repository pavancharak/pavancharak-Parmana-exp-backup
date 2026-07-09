import type { ExecutableContent } from "@parmana/shared";

/**
 * Maps verified executable content to the connector that
 * should execute it.
 *
 * Current implementation:
 *   Single vendor payment connector.
 *
 * Future:
 *   Deterministic routing based on capability,
 *   policy, tenant, connector metadata, etc.
 */
export function createConnectorRoute() {
  return (content: Readonly<ExecutableContent>): string => {
    switch (content.action) {
      case "payments:execute":
        return "vendor-payment";

      default:
        throw new Error(
          `No connector registered for action: ${content.action}.`,
        );
    }
  };
}