import { generateKeyPairSync } from "node:crypto";

import { CryptoBootstrap, type KeyProvider } from "@parmana/crypto";
import { CompositeSignalStateVerifier, type PolicySignals, type SignalStateVerificationRequest } from "@parmana/policy";
import type { ExecutionSystem } from "@parmana/execution-system";
import { RAZORPAY_REFUND_CREATE_CAPABILITY, RazorpaySignalStateVerifier } from "@parmana/connector-sdk";
import { HUBSPOT_DEAL_UPDATE_CAPABILITY, HubSpotSignalStateVerifier, type HubSpotDeal } from "@parmana/connector-hubspot";

//
// RuntimeEngine accepts exactly one SignalStateVerifier -- but a real
// deployment has one independent, capability-scoped verifier per
// connector (Tutorial 65's RazorpaySignalStateVerifier, Tutorial 71's
// HubSpotSignalStateVerifier). CompositeSignalStateVerifier is how
// those compose: each recognizes only its own action(s) and returns
// no violations for anything else, so the composite can query each in
// turn and let the one that actually understands a given request
// decide.
//
const crypto = CryptoBootstrap.create();

const FAKE_KEYS: KeyProvider = {
  async getMetadata() {
    return { keyId: "default", algorithm: "ed25519" };
  },
  async getPrivateKey() {
    return generateKeyPairSync("ed25519").privateKey;
  },
  async getPublicKey() {
    return generateKeyPairSync("ed25519").publicKey;
  },
  async hasKey() {
    return true;
  },
};

// A stub gateway for Razorpay: any fetch returns a fixed, real payment.
const razorpayGateway: ExecutionSystem = {
  async execute() {
    return {
      businessTransactionId: "tutorial-82",
      action: "razorpay:payment-fetch",
      target: "payments/pay_TUT082",
      parameters: {},
      success: true,
      executedAt: new Date(),
      metadata: {
        connector: {
          responseSummary: {
            metadata: {
              payment: {
                id: "pay_TUT082",
                entity: "payment",
                status: "captured",
                amount: 1_000_000,
                currency: "INR",
                amount_refunded: 0,
                captured: true,
              },
            },
          },
        },
      },
    } as never;
  },
};

// A stub gateway for HubSpot: any fetch returns a fixed, real deal.
const hubspotDeal: HubSpotDeal = { id: "9007", properties: { dealstage: "appointmentscheduled", amount: "10000" } };
const hubspotGateway: ExecutionSystem = {
  async execute() {
    return {
      businessTransactionId: "tutorial-82",
      action: "hubspot:deal-fetch",
      target: "deals/9007",
      parameters: {},
      success: true,
      executedAt: new Date(),
      metadata: { connector: { responseSummary: { metadata: { deal: hubspotDeal } } } },
    } as never;
  },
};

const razorpayVerifier = new RazorpaySignalStateVerifier({
  gateway: razorpayGateway,
  keys: FAKE_KEYS,
  signerKeyId: "default",
  policyName: "razorpay-refund",
  policyVersion: "1.0.0",
  crypto,
});

const hubspotVerifier = new HubSpotSignalStateVerifier({
  gateway: hubspotGateway,
  keys: FAKE_KEYS,
  signerKeyId: "default",
  policyName: "hubspot-deal-update",
  policyVersion: "1.0.0",
  crypto,
});

const composite = new CompositeSignalStateVerifier([razorpayVerifier, hubspotVerifier]);

console.log();
console.log("==================================================");
console.log("Tutorial 82 - Composite Signal-State Verification");
console.log("==================================================");
console.log();

console.log("Scenario 1: A razorpay:refund-create request with a mismatched signal");
console.log("--------------------------------------------------");

const razorpayRequest: SignalStateVerificationRequest = {
  action: RAZORPAY_REFUND_CREATE_CAPABILITY,
  businessTransactionId: "tutorial-82-razorpay",
  intentParameters: { paymentId: "pay_TUT082" },
};
const razorpaySignals: PolicySignals = {
  paymentStatus: "refunded", // real state (from the stub gateway) is "captured"
  paymentCurrency: "INR",
  refundableRemainingPaise: 1_000_000,
  requestedRefundAmountPaise: 250_000,
  requestedExceedsRemainder: false,
  dailyCumulativeAfterThisRefundPaise: 250_000,
};

const razorpayViolations = await composite.findViolations(razorpayRequest, razorpaySignals);
console.log(`Violations found : ${JSON.stringify(razorpayViolations)}`);
console.log(`(Caught by RazorpaySignalStateVerifier -- HubSpotSignalStateVerifier never even recognized this action)`);
console.log();

console.log("Scenario 2: A hubspot:deal-update request with a mismatched signal");
console.log("--------------------------------------------------");

const hubspotRequest: SignalStateVerificationRequest = {
  action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
  businessTransactionId: "tutorial-82-hubspot",
  intentParameters: { dealId: "9007" },
};
const hubspotSignals: PolicySignals = {
  currentDealStage: "closedwon", // real state (from the stub gateway) is "appointmentscheduled"
  dealStageChangeRequested: false,
  dealStageTransitionAllowed: true,
  amountChangeRequested: false,
  amountDeltaAbs: 0,
  amountChangeExceedsThreshold: false,
  preAuthorizedForAmountChange: false,
};

const hubspotViolations = await composite.findViolations(hubspotRequest, hubspotSignals);
console.log(`Violations found : ${JSON.stringify(hubspotViolations)}`);
console.log(`(Caught by HubSpotSignalStateVerifier -- RazorpaySignalStateVerifier never even recognized this action)`);
console.log();

console.log("Scenario 3: An unrelated action neither verifier recognizes");
console.log("--------------------------------------------------");

const unrelatedRequest: SignalStateVerificationRequest = {
  action: "payments:execute",
  businessTransactionId: "tutorial-82-unrelated",
  intentParameters: {},
};
const unrelatedViolations = await composite.findViolations(unrelatedRequest, { anything: true });
console.log(`Violations found : ${JSON.stringify(unrelatedViolations)} (neither verifier claims this action)`);
console.log();

const allPassed =
  razorpayViolations.length === 1 &&
  razorpayViolations[0]?.signalKey === "paymentStatus" &&
  hubspotViolations.length === 1 &&
  hubspotViolations[0]?.signalKey === "currentDealStage" &&
  unrelatedViolations.length === 0;

if (allPassed) {
  console.log(
    "✓ Each request was checked only by the verifier that actually understands its action -- no cross-contamination, no false positives.",
  );
} else {
  console.log("✗ Expected each request to be caught by exactly its own capability-scoped verifier.");
}

console.log();
console.log("Tutorial Complete");
console.log("All 82 tutorials available. Run `npm run examples` to execute the full suite.");
