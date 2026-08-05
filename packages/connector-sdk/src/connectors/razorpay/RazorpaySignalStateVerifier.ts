import type { CryptoProvider, KeyProvider } from "@parmana/crypto";
import type { ExecutionSystem } from "@parmana/execution-system";
import type {
  PolicySignals,
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "@parmana/policy";

import { executeRazorpayCapability, razorpayConnectorResponseMetadata } from "./RazorpayCapabilityExecution.js";
import { RAZORPAY_PAYMENT_FETCH_CAPABILITY, RAZORPAY_REFUND_CREATE_CAPABILITY } from "./RazorpayCapabilities.js";
import {
  RAZORPAY_DEFAULT_DAILY_CUMULATIVE_CAP_PAISE,
  buildRazorpayRefundSignals,
} from "./RazorpayRefundSignals.js";
import type { RazorpayPayment } from "./RazorpayTypes.js";
import type { RazorpayDailyRefundLedger } from "./RazorpayDailyRefundLedger.js";

export interface RazorpaySignalStateVerifierOptions {
  readonly gateway: ExecutionSystem;
  readonly keys: KeyProvider;
  readonly signerKeyId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly crypto: CryptoProvider;
  readonly authorizationTtlSeconds?: number;

  /**
   * TD-23 closure (Phase 3B). Optional and additive for the same
   * backward-compatibility reason every other optional field here is:
   * every pre-existing call site that constructs this class directly
   * must keep compiling and behaving identically. When omitted,
   * dailyCumulativeAfterThisRefundPaise is not independently verified
   * -- prior behavior, unchanged. When supplied, this class atomically
   * reserves the requested amount against refundDayResolver's day
   * (UTC by default) before reporting a verification result, and
   * releases the reservation immediately if doing so would exceed
   * dailyCumulativeCapPaise -- closing the gap where a caller could
   * declare any dailyCumulativeAfterThisRefundPaise value regardless of
   * real refund history (see docs/architecture/phase3b-cumulative-authorization.md).
   */
  readonly dailyRefundLedger?: RazorpayDailyRefundLedger;

  /**
   * Must match policies/razorpay-refund/1.0.0/policy.json's own
   * "reject-exceeds-daily-cumulative-cap" rule value exactly -- see
   * RazorpayRefundSignals.ts's own comment on this same coupling risk.
   * Defaults to RAZORPAY_DEFAULT_DAILY_CUMULATIVE_CAP_PAISE.
   */
  readonly dailyCumulativeCapPaise?: number;

  /**
   * Returns the current UTC calendar day, "YYYY-MM-DD". A parameter
   * (not always `new Date()` inline) so tests can pin the day
   * deterministically. Defaults to the real current UTC date.
   */
  readonly refundDayResolver?: () => string;
}

function defaultRefundDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Signal keys this verifier independently re-derives from a real
 * Razorpay payment fetch and compares against the caller-declared
 * value. dailyCumulativeAfterThisRefundPaise is handled separately
 * (see reserveDailyCumulative below), not by comparison against a
 * Razorpay-reported fact -- Razorpay has no concept of Parmana's own
 * daily cap, so there is nothing to fetch and compare here; instead
 * it is independently derived from Parmana's own atomic reservation
 * ledger (TD-23 closure, Phase 3B).
 */
const VERIFIED_SIGNAL_KEYS = [
  "paymentStatus",
  "paymentCurrency",
  "refundableRemainingPaise",
  "requestedExceedsRemainder",
] as const;

/**
 * G-24 residual closure (RFC-0022): independently verifies the
 * razorpay-refund policy's signals against a real Razorpay payment
 * fetch, immediately before PolicyEngine.evaluate would otherwise
 * trust them verbatim.
 *
 * Reuses exactly the fetch RazorpayRefundService already performs --
 * executeRazorpayCapability against RAZORPAY_PAYMENT_FETCH_CAPABILITY,
 * buildRazorpayRefundSignals to derive the canonical facts -- so
 * "verified" here means the same thing it already means there.
 * requestedRefundAmountPaise is read from the caller's own declared
 * signals rather than re-derived: by the time RuntimeEngine calls this
 * verifier, SignalIntentBinder has already proven that value equals
 * intent.parameters.amountPaise (see policies/razorpay-refund's
 * boundSignals), so it is not an independent, unverified claim here.
 *
 * Fails closed: a fetch error (network failure, malformed response,
 * payment not found) becomes a violation, not a pass-through -- a
 * request whose real state cannot be confirmed is refused, never
 * approved on faith in the caller's own claim.
 */
export class RazorpaySignalStateVerifier implements SignalStateVerifier {
  constructor(private readonly options: RazorpaySignalStateVerifierOptions) {}

  async findViolations(
    request: SignalStateVerificationRequest,
    signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    if (request.action !== RAZORPAY_REFUND_CREATE_CAPABILITY) {
      return [];
    }

    const paymentId = request.intentParameters?.paymentId;

    if (typeof paymentId !== "string" || paymentId.length === 0) {
      return [
        {
          signalKey: "paymentId",
          declaredValue: paymentId,
          actualValue: "<missing: parameters.paymentId is required to verify payment state>",
        },
      ];
    }

    let payment: RazorpayPayment;

    try {
      const signerPrivateKey = await this.options.keys.getPrivateKey(this.options.signerKeyId);

      const fetchResult = await executeRazorpayCapability(
        {
          gateway: this.options.gateway,
          signerPrivateKey,
          signerKeyId: this.options.signerKeyId,
          policyName: this.options.policyName,
          policyVersion: this.options.policyVersion,
          crypto: this.options.crypto,
          ...(this.options.authorizationTtlSeconds !== undefined
            ? { authorizationTtlSeconds: this.options.authorizationTtlSeconds }
            : {}),
        },
        {
          businessTransactionId: `${request.businessTransactionId}:state-verify`,
          action: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
          target: `payments/${paymentId}`,
          parameters: { paymentId },
        },
      );

      payment = razorpayConnectorResponseMetadata(fetchResult).payment as RazorpayPayment;
    } catch (error) {
      return [
        {
          signalKey: "razorpay:payment-fetch",
          declaredValue: "<declared signals, unverifiable>",
          actualValue: `<verification failed: ${error instanceof Error ? error.message : String(error)}>`,
        },
      ];
    }

    const requestedRefundAmountPaise = signals.requestedRefundAmountPaise;

    const verified = buildRazorpayRefundSignals({
      payment,
      requestedRefundAmountPaise: typeof requestedRefundAmountPaise === "number" ? requestedRefundAmountPaise : 0,
      dailyCumulativeSoFarPaise: 0,
    });

    const violations: SignalStateViolation[] = [];

    for (const key of VERIFIED_SIGNAL_KEYS) {
      const declaredValue = signals[key];
      const actualValue = verified[key];

      if (declaredValue !== actualValue) {
        violations.push({ signalKey: key, declaredValue, actualValue });
      }
    }

    //
    // Daily cumulative reservation (TD-23 closure, Phase 3B).
    //
    // Skipped entirely when a violation already exists above: a
    // request already going to be rejected on independently-verified
    // grounds needs no cap reservation, which would otherwise
    // needlessly consume headroom for a refund that will never
    // execute -- the same "provisional decision" short-circuit
    // discipline RuntimeEngine's own SignalIntentBinder-before-
    // PolicyEngine ordering already established.
    //
    if (violations.length === 0 && this.options.dailyRefundLedger !== undefined) {
      const cumulativeViolation = await this.reserveDailyCumulative(
        signals,
        typeof requestedRefundAmountPaise === "number" ? requestedRefundAmountPaise : 0,
      );

      if (cumulativeViolation !== undefined) {
        violations.push(cumulativeViolation);
      }
    }

    return violations;
  }

  /**
   * Atomically reserves requestedRefundAmountPaise against today's
   * (UTC) running total, via the configured RazorpayDailyRefundLedger.
   * Returns a violation, and immediately releases the reservation, if
   * doing so would push the total over dailyCumulativeCapPaise;
   * otherwise leaves the reservation in place and returns undefined.
   *
   * The reservation -- not a read-then-decide comparison -- IS the
   * atomicity mechanism: two concurrent calls for the same day are
   * serialized by the ledger's own row lock, so each caller's
   * totalAfterReservation correctly reflects the other's already-
   * applied contribution once it commits, closing the race a plain
   * "SELECT SUM(...) then compare" could not (see
   * docs/architecture/phase3b-cumulative-authorization.md).
   */
  private async reserveDailyCumulative(
    signals: PolicySignals,
    requestedRefundAmountPaise: number,
  ): Promise<SignalStateViolation | undefined> {
    const ledger = this.options.dailyRefundLedger;

    if (ledger === undefined) {
      return undefined;
    }

    const cap = this.options.dailyCumulativeCapPaise ?? RAZORPAY_DEFAULT_DAILY_CUMULATIVE_CAP_PAISE;
    const refundDay = (this.options.refundDayResolver ?? defaultRefundDay)();

    const { totalAfterReservation } = await ledger.reserve(refundDay, requestedRefundAmountPaise);

    const declaredValue = signals.dailyCumulativeAfterThisRefundPaise;

    // Any disagreement between the caller's declared value and the
    // real, independently-derived one is a violation -- the same
    // uniform "declared vs. verified, any mismatch rejects" discipline
    // VERIFIED_SIGNAL_KEYS already applies to the other four facts,
    // regardless of whether the real total happens to still be within
    // cap. Exceeding the cap is simply one specific way the two values
    // can disagree (a caller who understated the total to stay
    // "within cap" on paper).
    const violated = totalAfterReservation > cap || declaredValue !== totalAfterReservation;

    if (violated) {
      // This request is being rejected and will never reach the
      // connector, so it must never actually count against the day's
      // real total -- release unconditionally, not only for the
      // over-cap case. An unreleased reservation for a request that
      // never executes would incorrectly, permanently shrink every
      // later caller's real headroom for the rest of the day.
      await ledger.release(refundDay, requestedRefundAmountPaise);

      return {
        signalKey: "dailyCumulativeAfterThisRefundPaise",
        declaredValue,
        actualValue: totalAfterReservation,
      };
    }

    return undefined;
  }
}
