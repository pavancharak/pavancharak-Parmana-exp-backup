import {
  EnvironmentCredentialProvider,
  StaticCredentialProvider,
  type CredentialProvider,
} from "@parmana/connector-sdk";

/**
 * Creates the credential provider.
 *
 * Production uses environment variables.
 * Tests use an in-memory credential.
 */
export function createCredentialProvider(): CredentialProvider {
  if (process.env.NODE_ENV === "test") {
    return new StaticCredentialProvider({
      "vendor-payment": {
        token: "integration-test-token",
      },
    });
  }

  return new EnvironmentCredentialProvider({
    "vendor-payment": "VENDOR_PAYMENT_TOKEN",
  });
}