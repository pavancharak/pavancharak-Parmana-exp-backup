import { RAZORPAY_WEBHOOK_TEST_MODE_PLACEHOLDER_SECRET } from "../webhooks/RazorpayWebhookTypes.js";

/**
 * Resolves the Razorpay webhook secret, or undefined when the webhook
 * route should not be registered at all.
 *
 * Test (NODE_ENV=test): RAZORPAY_TEST_WEBHOOK_SECRET, or a built-in
 * placeholder if unset — mirrors createRazorpayCredentialProvider.ts's
 * RAZORPAY_TEST_KEY_ID/SECRET split exactly, so hermetic tests always
 * have a usable secret with zero setup.
 *
 * Production: RAZORPAY_WEBHOOK_SECRET. If unset, returns undefined —
 * app.ts then never mounts POST /webhooks/razorpay at all, so a
 * request to it 404s (Express's own "no route matches" response)
 * rather than the process starting with a guessable default secret, or
 * the whole API refusing to start over one optional route. Mirrors
 * createRazorpayCredentialProvider.ts's production-mode fail-closed
 * shape (undefined -> capability/route simply absent).
 */
export function resolveRazorpayWebhookSecret(): string | undefined {
  if (process.env.NODE_ENV === "test") {
    return process.env.RAZORPAY_TEST_WEBHOOK_SECRET ?? RAZORPAY_WEBHOOK_TEST_MODE_PLACEHOLDER_SECRET;
  }

  return process.env.RAZORPAY_WEBHOOK_SECRET;
}
