import { CryptoBootstrap, DEFAULT_KEY_ID, FileKeyProvider } from "@parmana/crypto";
import { HubSpotSignalStateVerifier } from "@parmana/connector-hubspot";
import type { SignalStateVerifier } from "@parmana/policy";
import type { ExecutionSystem } from "@parmana/execution-system";

import { loadConfig } from "@parmana/shared";

/**
 * Creates the production Signal/State Verifier for the
 * hubspot-deal-update capability (G-24 residual closure, RFC-0022).
 * Mirrors createRazorpaySignalStateVerifier.ts exactly: signs its own
 * independent verification fetches with the same signing key and
 * key-loading mechanism RuntimeAuthorizationSigner already uses
 * (FileKeyProvider, keyId "default") -- lazily, on each call -- so
 * this stays a plain, synchronous constructor with no new async
 * wiring at startup.
 */
export function createHubSpotSignalStateVerifier(
  executionSystem: ExecutionSystem,
): SignalStateVerifier {
  const {
    ttlSeconds: authorizationTtlSeconds,
  } = loadConfig().authorization;

  return new HubSpotSignalStateVerifier({
    gateway: executionSystem,
    keys: new FileKeyProvider(),
    signerKeyId: DEFAULT_KEY_ID,
    policyName: "hubspot-deal-update",
    policyVersion: "1.0.0",
    crypto: CryptoBootstrap.create(),
    authorizationTtlSeconds,
  });
}
