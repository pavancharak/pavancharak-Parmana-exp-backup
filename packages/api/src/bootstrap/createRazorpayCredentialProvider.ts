import {
  StaticCredentialProvider,
  brandCredentialHandle,
  type CredentialHandle,
  type CredentialProvider,
} from "@parmana/connector-sdk";

const RAZORPAY_CONNECTOR_ID = "razorpay";

/**
 * Resolves Razorpay's credential: a key_id/key_secret pair, a shape
 * EnvironmentCredentialProvider's one-environment-variable-per-connector
 * mapping cannot express (it produces a single { token } value). A small
 * dedicated provider is used instead of widening that shared seam's
 * contract for one connector.
 *
 * key_secret is read from process.env only inside resolve(), held only in
 * the returned CredentialHandle's value, and never placed anywhere else —
 * not logged, not embedded in a thrown error (only the variable names
 * RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET ever appear in messages).
 */
class RazorpayEnvironmentCredentialProvider implements CredentialProvider {
  readonly providerId = "environment";

  async resolve(connectorId: string): Promise<CredentialHandle> {
    if (connectorId !== RAZORPAY_CONNECTOR_ID) {
      throw new Error(
        `RazorpayEnvironmentCredentialProvider cannot resolve credentials for connector "${connectorId}".`,
      );
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (keyId === undefined || keySecret === undefined) {
      throw new Error(
        "Environment variables RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for connector " +
          `"${RAZORPAY_CONNECTOR_ID}" are not set.`,
      );
    }

    return brandCredentialHandle({
      providerId: this.providerId,
      credentialId: "RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET",
      value: Object.freeze({ keyId, keySecret }),
    });
  }
}

/**
 * Creates the Razorpay credential provider, or undefined when the
 * razorpay capability should not be registered at all.
 *
 * Test (NODE_ENV=test): a static key_id/key_secret pair, overridable via
 * TEST_RAZORPAY_KEY_ID / TEST_RAZORPAY_KEY_SECRET — mirrors
 * createCredentialProvider.ts's existing vendor-payment test/production
 * split.
 *
 * Production: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. If either is
 * unset, this returns undefined rather than a partially-configured
 * provider or a fallback to mock credentials. createConnectorRegistry.ts
 * does not register the Razorpay connector at all in that case, so
 * razorpay:payment-fetch / razorpay:refund-create simply have no
 * connector to resolve to — ConnectorSdkRegistry.resolveCapability's
 * existing "No connector registered for capability" fail-closed error —
 * rather than a startup crash that would also take down every other,
 * unrelated capability this process serves.
 */
export function createRazorpayCredentialProvider(): CredentialProvider | undefined {
  if (process.env.NODE_ENV === "test") {
    return new StaticCredentialProvider({
      [RAZORPAY_CONNECTOR_ID]: {
        keyId: process.env.TEST_RAZORPAY_KEY_ID ?? "rzp_test_integration00",
        keySecret: process.env.TEST_RAZORPAY_KEY_SECRET ?? "integration-test-key-secret",
      },
    });
  }

  if (process.env.RAZORPAY_KEY_ID === undefined || process.env.RAZORPAY_KEY_SECRET === undefined) {
    return undefined;
  }

  return new RazorpayEnvironmentCredentialProvider();
}
