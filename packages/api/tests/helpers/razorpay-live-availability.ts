/**
 * Whether real Razorpay TEST MODE credentials are configured in the
 * environment.
 *
 * Mirrors supabase-availability.ts: the live-test-mode-gated Razorpay
 * suite needs a real Razorpay test account to talk to and cannot run
 * hermetically from a bare clone (see packages/api/README.md for the env
 * vars that enable it).
 */
export function hasRazorpayLiveConfig(): boolean {
  return Boolean(
    process.env.RAZORPAY_TEST_KEY_ID && process.env.RAZORPAY_TEST_KEY_SECRET,
  );
}

/**
 * Resolves whether the Razorpay live-test-mode-gated suite should run,
 * enforcing the same live-credential opt-in as resolveSupabaseGate (see
 * that file's comment): RAZORPAY_TEST_KEY_ID/RAZORPAY_TEST_KEY_SECRET
 * being configured is not by itself enough to run against Razorpay's real
 * test-mode API. ALLOW_LIVE_RAZORPAY=1 must also be set explicitly, or
 * the suite skips cleanly rather than silently making a real network
 * call — a default `npm test` on a machine with test keys configured
 * (the common daily-development case) stays green and side-effect-free.
 * Explicitly requesting a live run with ALLOW_LIVE_RAZORPAY=1 but no
 * visible credentials is a hard failure, not a skip, for the same reason
 * resolveSupabaseGate's G-14 fix treats it that way: explicit intent must
 * never quietly degrade to a silent skip.
 *
 * Additionally fail-closed on doubt, specific to this connector: this
 * suite moves (simulated) money, so once a live run is confirmed,
 * RAZORPAY_TEST_KEY_ID must start with "rzp_test_" or the whole suite
 * aborts hard, before any network call is made — a malformed or
 * accidentally-live-mode key id must never quietly proceed.
 */
export function resolveRazorpayLiveGate(suiteLabel: string): boolean {
  const configured = hasRazorpayLiveConfig();
  const optedIn = process.env.ALLOW_LIVE_RAZORPAY === "1";

  if (configured && !optedIn) {
    console.log(
      `${suiteLabel}: Razorpay test-mode credentials configured but ` +
        "ALLOW_LIVE_RAZORPAY=1 not set — skipping live suite. Set " +
        "ALLOW_LIVE_RAZORPAY=1 to run it.",
    );
    return false;
  }

  if (optedIn && !configured) {
    throw new Error(
      `${suiteLabel}: ALLOW_LIVE_RAZORPAY=1 is set — a live run was ` +
        "explicitly requested — but RAZORPAY_TEST_KEY_ID / " +
        "RAZORPAY_TEST_KEY_SECRET are not visible to this worker. " +
        "Refusing to silently skip a suite that was explicitly asked to " +
        "run live.",
    );
  }

  if (!configured) {
    console.log(
      `[SKIP] ${suiteLabel}: RAZORPAY_TEST_KEY_ID / ` +
        "RAZORPAY_TEST_KEY_SECRET not set. See packages/api/README.md to " +
        "enable this suite.",
    );
    return false;
  }

  const keyId = process.env.RAZORPAY_TEST_KEY_ID as string;

  if (!keyId.startsWith("rzp_test_")) {
    throw new Error(
      `${suiteLabel}: RAZORPAY_TEST_KEY_ID does not start with ` +
        '"rzp_test_" — refusing to run this suite against what may be a ' +
        "live-mode key. Aborting before any network call is made.",
    );
  }

  return true;
}

/**
 * Third gating tier, nested inside resolveRazorpayLiveGate's: even once a
 * live run is confirmed (ALLOW_LIVE_RAZORPAY=1 plus a valid rzp_test_
 * key), the money-moving refund-creation case additionally requires a
 * manually captured test-mode payment to refund (see
 * packages/api/README.md — Razorpay test-mode payments can only be
 * captured through client-side Checkout, which cannot be driven
 * headlessly). Only call this once the caller has already confirmed the
 * base live gate is active; it does not re-check ALLOW_LIVE_RAZORPAY or
 * the key pair itself.
 *
 * Absence is a clean skip (this one case only — the other, non-money-
 * moving live cases still run) and is never a failure, per the same
 * "explicit intent must never quietly degrade, but absence is not
 * intent" reasoning as resolveRazorpayLiveGate. A malformed value that
 * IS present, however, is treated the same as a malformed key id: a
 * configuration error, aborted before any network call, not silently
 * ignored or coerced.
 */
export function resolveRazorpayCapturedPaymentGate(
  suiteLabel: string,
): string | undefined {
  const paymentId = process.env.TEST_RAZORPAY_CAPTURED_PAYMENT_ID;

  if (paymentId === undefined) {
    console.log(
      `[SKIP] ${suiteLabel}: TEST_RAZORPAY_CAPTURED_PAYMENT_ID not set — ` +
        "skipping the live refund-creation case only; the other live " +
        "Razorpay cases in this file still run. See " +
        "packages/api/README.md to enable this case.",
    );
    return undefined;
  }

  if (!paymentId.startsWith("pay_")) {
    throw new Error(
      `${suiteLabel}: TEST_RAZORPAY_CAPTURED_PAYMENT_ID does not start ` +
        'with "pay_" — refusing to run the refund-creation case against ' +
        "a malformed payment id. Aborting before any network call is " +
        "made.",
    );
  }

  return paymentId;
}

/**
 * Redacts a Razorpay payment id to its last 4 characters for safe
 * inclusion in test output/logs — mirrors redactRazorpayKeyId's own
 * first-8-chars convention (RazorpayTypes.ts) but redacts from the
 * front instead, since a payment id's trailing characters are the ones
 * that vary and are least likely to be independently identifying.
 */
export function redactRazorpayPaymentId(paymentId: string): string {
  const visible = paymentId.slice(-4);
  return `${"*".repeat(Math.max(0, paymentId.length - visible.length))}${visible}`;
}
