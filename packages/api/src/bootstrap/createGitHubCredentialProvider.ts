import { generateKeyPairSync } from "node:crypto";

import type { CredentialProvider } from "@parmana/connector-sdk";
import { createGatewayGitHubCredentialProvider } from "@parmana/execution-gateway";

// Arbitrary, well-formed-looking placeholders -- never checked against
// GitHub's real API. Only ever used together with a freshly generated
// (and therefore never-real) private key, against a mock server that (like
// MockGitHubServer) does not verify the App JWT's signature.
const GITHUB_TEST_MODE_APP_ID = "1";
const GITHUB_TEST_MODE_INSTALLATION_ID = "1";

/**
 * Creates the GitHub App credential provider, or undefined when the
 * github capability should not be registered at all.
 *
 * GitHub's credential is ephemeral (docs/CLAIMS.md Claim 1): every
 * resolve() call performs a real JWT-signed network exchange for a
 * short-lived installation token, unlike HubSpot's single static token
 * (see createHubSpotCredentialProvider.ts). "Test mode" therefore cannot
 * be a fixed value the way HubSpot's is -- it still needs a working
 * (appId, installationId, privateKey) triple to sign a JWT and exchange
 * it, just never the real one, and never a real call to GitHub's actual
 * API.
 *
 * Test (NODE_ENV=test):
 *  - TEST_GITHUB_APP_ID / TEST_GITHUB_INSTALLATION_ID /
 *    TEST_GITHUB_APP_PRIVATE_KEY, when all three are set, are used
 *    as-is -- this is what the live-gated GitHub suite sets, mirroring
 *    TEST_HUBSPOT_PRIVATE_APP_TOKEN's role for HubSpot's live suite, so a
 *    real installation token can be minted against GitHub's real API.
 *  - Otherwise, a freshly generated RSA keypair paired with harmless
 *    placeholder ids, matched to GITHUB_BASE_URL (the hermetic test
 *    seam -- see createGitHubConnector.ts). This never depends on
 *    whatever GITHUB_APP_ID/GITHUB_INSTALLATION_ID/GITHUB_APP_PRIVATE_KEY
 *    happen to be set to in the ambient environment, the same isolation
 *    HubSpot's hermetic suite gets by overriding
 *    TEST_HUBSPOT_PRIVATE_APP_TOKEN rather than trusting whatever is
 *    ambiently present.
 *
 * Production: GITHUB_APP_ID, GITHUB_INSTALLATION_ID,
 * GITHUB_APP_PRIVATE_KEY. If any is unset, this returns undefined rather
 * than a partially-configured provider -- createConnectorRegistry.ts does
 * not register the GitHub connector at all in that case. Mirrors
 * createHubSpotCredentialProvider.ts's test/production split exactly.
 */
export function createGitHubCredentialProvider(): CredentialProvider | undefined {
  const baseUrl = process.env.GITHUB_BASE_URL;

  if (process.env.NODE_ENV === "test") {
    const testAppId = process.env.TEST_GITHUB_APP_ID;
    const testInstallationId = process.env.TEST_GITHUB_INSTALLATION_ID;
    const testPrivateKey = process.env.TEST_GITHUB_APP_PRIVATE_KEY;

    if (testAppId !== undefined && testInstallationId !== undefined && testPrivateKey !== undefined) {
      return createGatewayGitHubCredentialProvider({
        appId: testAppId,
        installationId: testInstallationId,
        privateKey: testPrivateKey,
        ...(baseUrl !== undefined ? { baseUrl } : {}),
      });
    }

    const { privateKey: generatedKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

    return createGatewayGitHubCredentialProvider({
      appId: GITHUB_TEST_MODE_APP_ID,
      installationId: GITHUB_TEST_MODE_INSTALLATION_ID,
      privateKey: generatedKey,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
    });
  }

  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (appId === undefined || installationId === undefined || privateKey === undefined) {
    return undefined;
  }

  return createGatewayGitHubCredentialProvider({ appId, installationId, privateKey });
}
