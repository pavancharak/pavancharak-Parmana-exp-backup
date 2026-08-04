import { CryptoBootstrap, DEFAULT_KEY_ID, FileKeyProvider } from "@parmana/crypto";
import { RazorpaySignalStateVerifier } from "@parmana/connector-sdk";
import type { SignalStateVerifier } from "@parmana/policy";
import type { ExecutionSystem } from "@parmana/execution-system";

import { loadConfig } from "@parmana/shared";

/**
 * Creates the production Signal/State Verifier for the razorpay-refund
 * capability (G-24 residual closure, RFC-0022).
 *
 * Signs its own independent verification fetches with the same signing
 * key and key-loading mechanism RuntimeAuthorizationSigner already uses
 * (FileKeyProvider, keyId "default") -- lazily, on each call, exactly
 * like RuntimeAuthorizationSigner.sign() does, so this stays a plain,
 * synchronous constructor with no new async wiring at startup.
 */
export function createRazorpaySignalStateVerifier(
  executionSystem: ExecutionSystem,
): SignalStateVerifier {
  const {
    ttlSeconds: authorizationTtlSeconds,
  } = loadConfig().authorization;

  return new RazorpaySignalStateVerifier({
    gateway: executionSystem,
    keys: new FileKeyProvider(),
    signerKeyId: DEFAULT_KEY_ID,
    policyName: "razorpay-refund",
    policyVersion: "1.0.0",
    crypto: CryptoBootstrap.create(),
    authorizationTtlSeconds,
  });
}
