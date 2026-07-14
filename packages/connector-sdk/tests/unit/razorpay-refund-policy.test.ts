import { readFileSync } from "node:fs";
import path from "node:path";

import { PolicyEngine, PolicyOutcome, PolicyValidator, type Policy, type PolicySignals } from "@parmana/policy";
import { describe, expect, it } from "vitest";

const policy = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../../../policies/razorpay-refund/1.0.0/policy.json"),
    "utf8",
  ),
) as Policy;

function baseSignals(overrides: Partial<PolicySignals> = {}): PolicySignals {
  return {
    paymentStatus: "captured",
    paymentCurrency: "INR",
    refundableRemainingPaise: 100000,
    requestedRefundAmountPaise: 25000,
    requestedExceedsRemainder: false,
    dailyCumulativeAfterThisRefundPaise: 25000,
    ...overrides,
  };
}

describe("razorpay-refund policy", () => {
  const validator = new PolicyValidator();
  const engine = new PolicyEngine();

  it("validates against the locked policy schema", () => {
    expect(() => validator.validate(policy)).not.toThrow();
  });

  it("approves a refund when every rule is satisfied", () => {
    const decision = engine.evaluate(policy, baseSignals());
    expect(decision.outcome).toBe(PolicyOutcome.APPROVE);
    expect(decision.matchedRuleId).toBe("approve-refund");
  });

  it("denies when the payment is not captured", () => {
    const decision = engine.evaluate(policy, baseSignals({ paymentStatus: "authorized" }));
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-payment-not-captured");
    expect(decision.reason).toMatch(/not captured/);
  });

  it("denies when the currency is not INR", () => {
    const decision = engine.evaluate(policy, baseSignals({ paymentCurrency: "USD" }));
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-currency-not-inr");
  });

  it("denies a non-positive refund amount", () => {
    const decision = engine.evaluate(policy, baseSignals({ requestedRefundAmountPaise: 0 }));
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-non-positive-amount");
  });

  it("denies when the requested amount exceeds the refundable remainder", () => {
    const decision = engine.evaluate(
      policy,
      baseSignals({ requestedRefundAmountPaise: 150000, requestedExceedsRemainder: true }),
    );
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-exceeds-refundable-remainder");
  });

  it("denies when the requested amount exceeds the per-refund cap of 500000 paise", () => {
    const decision = engine.evaluate(
      policy,
      baseSignals({
        refundableRemainingPaise: 900000,
        requestedRefundAmountPaise: 500001,
        dailyCumulativeAfterThisRefundPaise: 500001,
      }),
    );
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-exceeds-per-refund-cap");
  });

  it("denies when it would exceed the daily cumulative cap of 2000000 paise", () => {
    const decision = engine.evaluate(
      policy,
      baseSignals({
        refundableRemainingPaise: 500000,
        requestedRefundAmountPaise: 500000,
        dailyCumulativeAfterThisRefundPaise: 2000001,
      }),
    );
    expect(decision.outcome).toBe(PolicyOutcome.REJECT);
    expect(decision.matchedRuleId).toBe("reject-exceeds-daily-cumulative-cap");
  });

  it("never produces a require_override outcome", () => {
    for (const rule of policy.rules) {
      expect(rule.outcome.action).not.toBe("require_override");
    }
  });
});
