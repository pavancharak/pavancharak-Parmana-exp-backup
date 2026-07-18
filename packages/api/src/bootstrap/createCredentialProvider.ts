import {
  EnvironmentCredentialProvider,
  StaticCredentialProvider,
  type CredentialProvider,
} from "@parmana/connector-sdk";

/**
 * Creates the credential provider.
 *
 * Production:
 *   - Credentials are loaded from environment variables.
 *
 * Test:
 *   - Uses an in-memory static credential provider.
 *   - Credentials can be overridden via TEST_* environment variables.
 *   - Safe defaults keep tests deterministic.
 */
export function createCredentialProvider(): CredentialProvider {
  if (process.env.NODE_ENV === "test") {
    return new StaticCredentialProvider({
      "vendor-payment": {
        token:
          process.env.TEST_VENDOR_PAYMENT_TOKEN ??
          "integration-test-token",
      },
    });
  }

  return new EnvironmentCredentialProvider({
    "vendor-payment": "VENDOR_PAYMENT_TOKEN",
  });
}