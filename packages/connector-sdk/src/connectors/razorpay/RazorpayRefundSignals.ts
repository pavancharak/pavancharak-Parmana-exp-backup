import type { PolicySignals } from "@parmana/policy";

import type { RazorpayPayment } from "./RazorpayTypes.js";

/**
 * Default daily cumulative refund cap (in paise), used by
 * RazorpayCumulativeRefundLedger.recordApprovedRefundIfWithinCap as the
 * default for RazorpayRefundServiceOptions.dailyCumulativeCapPaise.
 *
 * MUST match policies/razorpay-refund/1.0.0/policy.json's
 * "reject-exceeds-daily-cumulative-cap" rule value exactly -- the two
 * are not mechanically linked (the policy is hand-authored JSON;
 * nothing reads a rule's literal value back out of it), the same
 * accepted coupling risk HUBSPOT_DEFAULT_AMOUNT_CHANGE_THRESHOLD
 * already carries against hubspot-deal-update's policy.
 */
export const RAZORPAY_DEFAULT_DAILY_CUMULATIVE_CAP_PAISE = 2_000_000;

export interface BuildRazorpayRefundSignalsInput {
  readonly payment: RazorpayPayment;
  readonly requestedRefundAmountPaise: number;
  readonly dailyCumulativeSoFarPaise: number;
}

/**
 * Assembles the runtime signals the razorpay-refund policy evaluates.
 * Arithmetic (refundable remainder, cumulative-after-this-refund) happens
 * here, not inside PolicyEngine's OperatorEvaluator, which only compares a
 * single fact against a literal value and has no fact-to-fact arithmetic.
 */
export function buildRazorpayRefundSignals(input: BuildRazorpayRefundSignalsInput): PolicySignals {
  const refundableRemainingPaise = input.payment.amount - input.payment.amount_refunded;
  const requestedExceedsRemainder = input.requestedRefundAmountPaise > refundableRemainingPaise;

  return {
    paymentStatus: input.payment.status,
    paymentCurrency: input.payment.currency,
    refundableRemainingPaise,
    requestedRefundAmountPaise: input.requestedRefundAmountPaise,
    requestedExceedsRemainder,
    dailyCumulativeAfterThisRefundPaise: input.dailyCumulativeSoFarPaise + input.requestedRefundAmountPaise,
  };
}
