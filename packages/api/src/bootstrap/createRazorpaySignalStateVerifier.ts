import { CryptoBootstrap, DEFAULT_KEY_ID, FileKeyProvider } from "@parmana/crypto";
import { RazorpaySignalStateVerifier } from "@parmana/connector-sdk";
import type { SignalStateVerifier } from "@parmana/policy";
import type { ExecutionSystem } from "@parmana/execution-system";

import { loadConfig } from "@parmana/shared";

import { createRazorpayDailyRefundLedger } from "./createRazorpayDailyRefundLedger.js";

/**
 * Creates the production Signal/State Verifier for the razorpay-refund
 * capability (G-24 residual closure, RFC-0022; TD-23 daily-cumulative-cap
 * closure, Phase 3B).
 *
 * Signs its own independent verification fetches with the same signing
 * key and key-loading mechanism RuntimeAuthorizationSigner already uses
 * (FileKeyProvider, keyId "default") -- lazily, on each call, exactly
 * like RuntimeAuthorizationSigner.sign() does, so this stays a plain,
 * synchronous constructor with no new async wiring at startup.
 *
 * dailyRefundLedger is always supplied here (never omitted) -- the
 * production wiring path is where the daily cumulative cap becomes a
 * structural invariant rather than an optional, caller-declared signal;
 * omitting it is only ever done by tests that construct
 * RazorpaySignalStateVerifier directly.
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
    dailyRefundLedger: createRazorpayDailyRefundLedger(),
  });
}
