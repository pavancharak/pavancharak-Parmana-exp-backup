import { describe, expect, it } from "vitest";

import {
  CANONICAL_CAPABILITY_POLICY_BINDINGS,
  CapabilityPolicyBinder,
} from "../../src/CapabilityPolicyBinding.js";
import type { PolicyReference } from "@parmana/shared";

/**
 * Found by an independent repository verification (Phase 2K, TD-22):
 * nothing bound a capability to the one policy that authorizes it.
 * boundSignals/SignalStateVerifier protections are declared per-policy
 * and per-action respectively, so a caller could pair a real capability
 * (e.g. razorpay:refund-create) with an unrelated, unprotected policy
 * (e.g. customer-refund/1.0.0, which declares no boundSignals) and
 * bypass those protections entirely, since PolicyEngine.evaluate takes
 * no action parameter and nothing else cross-checks policy identity
 * against capability identity. This is the regression suite proving
 * that gap is now closed.
 */
describe("CapabilityPolicyBinder", () => {
  it("reports no violation for an action with no canonical binding (every test/tutorial action)", () => {
    const binder = new CapabilityPolicyBinder();

    const violation = binder.findViolation("PAY", {
      name: "payment-approval",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    });

    expect(violation).toBeUndefined();
  });

  it("reports no violation when the declared policy matches the canonical binding", () => {
    const binder = new CapabilityPolicyBinder();

    const violation = binder.findViolation("razorpay:refund-create", {
      name: "razorpay-refund",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    });

    expect(violation).toBeUndefined();
  });

  it("blocks the exact live-shaped exploit: a real capability paired with an unrelated, unprotected policy", () => {
    const binder = new CapabilityPolicyBinder();

    // The exact attack found during verification: razorpay:refund-create
    // (a fund-moving capability whose amount/payment-state protections
    // are scoped to razorpay-refund/1.0.0's own boundSignals) paired
    // with customer-refund/1.0.0, a real, loadable policy that declares
    // no boundSignals at all.
    const declared: PolicyReference = {
      name: "customer-refund",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    };

    const violation = binder.findViolation("razorpay:refund-create", declared);

    expect(violation).toEqual({
      action: "razorpay:refund-create",
      expected: {
        name: "razorpay-refund",
        version: "1.0.0",
        schemaVersion: "1.0.0",
      },
      declared,
    });
  });

  it("blocks the same shape of substitution for hubspot:deal-update", () => {
    const binder = new CapabilityPolicyBinder();

    const violation = binder.findViolation("hubspot:deal-update", {
      name: "vendor-payment",
      version: "2.0.0",
      schemaVersion: "1.0.0",
    });

    expect(violation?.expected).toEqual({
      name: "hubspot-deal-update",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    });
  });

  it("reports a violation for a version mismatch even when the policy name matches", () => {
    const binder = new CapabilityPolicyBinder();

    const violation = binder.findViolation("razorpay:refund-create", {
      name: "razorpay-refund",
      version: "9.9.9",
      schemaVersion: "1.0.0",
    });

    expect(violation).toBeDefined();
  });

  it("has exactly one canonical policy per bound capability", () => {
    const seenActions = new Set<string>();

    for (const action of CANONICAL_CAPABILITY_POLICY_BINDINGS.keys()) {
      expect(seenActions.has(action)).toBe(false);
      seenActions.add(action);
    }

    expect(CANONICAL_CAPABILITY_POLICY_BINDINGS.size).toBe(seenActions.size);
  });

  it("binds every capability the production connector registry actually registers", () => {
    const boundActions = new Set(CANONICAL_CAPABILITY_POLICY_BINDINGS.keys());

    //
    // payments:execute (vendor-payment) was in this set at Phase 2K,
    // when the vendor-payment connector was still registered. It was
    // removed entirely (docs/VERIFICATION-GAPS.md G-27), and this
    // binder's own canonical table was subsequently found to still
    // carry the stale entry -- a capability that no connector
    // resolves to has nothing for this binder to protect. Removed
    // here to match the actual current connector registry.
    //
    expect(boundActions).toEqual(
      new Set([
        "razorpay:payment-fetch",
        "razorpay:refund-create",
        "razorpay:refund-fetch",
        "hubspot:deal-fetch",
        "hubspot:deal-update",
      ]),
    );
  });
});
