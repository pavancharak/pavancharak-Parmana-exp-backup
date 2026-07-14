import type { PolicySignals } from "@parmana/policy";

import type { RazorpayPayment } from "./RazorpayTypes.js";

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
