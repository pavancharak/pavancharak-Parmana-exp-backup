import type { CryptoProvider, KeyProvider } from "@parmana/crypto";
import type { ExecutionSystem } from "@parmana/execution-system";
import type {
  PolicySignals,
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "@parmana/policy";

import { executeRazorpayCapability, razorpayConnectorResponseMetadata } from "./RazorpayCapabilityExecution.js";
import { RAZORPAY_PAYMENT_FETCH_CAPABILITY, RAZORPAY_REFUND_CREATE_CAPABILITY } from "./RazorpayConnector.js";
import { buildRazorpayRefundSignals } from "./RazorpayRefundSignals.js";
import type { RazorpayPayment } from "./RazorpayTypes.js";

export interface RazorpaySignalStateVerifierOptions {
  readonly gateway: ExecutionSystem;
  readonly keys: KeyProvider;
  readonly signerKeyId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly crypto: CryptoProvider;
  readonly authorizationTtlSeconds?: number;
}

/**
 * Signal keys this verifier independently re-derives from a real
 * Razorpay payment fetch and compares against the caller-declared
 * value. Deliberately excludes dailyCumulativeAfterThisRefundPaise:
 * that fact depends on Parmana's own cumulative-refund ledger, not on
 * anything Razorpay reports, and no ledger is wired to the production
 * POST /execute path today. That remains open -- see the "Not covered
 * by this change" note this fix's docs update adds alongside G-24.
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

    return violations;
  }
}
