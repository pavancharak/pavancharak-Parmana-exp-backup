import type { CryptoProvider, KeyProvider } from "@parmana/crypto";
import type { ExecutionSystem } from "@parmana/execution-system";
import type {
  PolicySignals,
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "@parmana/policy";

import { executeHubSpotCapability, hubSpotConnectorResponseMetadata } from "./HubSpotCapabilityExecution.js";
import { HUBSPOT_DEAL_FETCH_CAPABILITY, HUBSPOT_DEAL_UPDATE_CAPABILITY } from "./HubSpotCapabilities.js";
import { buildHubSpotDealUpdateSignals } from "./HubSpotDealUpdateSignals.js";
import type { HubSpotDeal } from "./HubSpotTypes.js";

export interface HubSpotSignalStateVerifierOptions {
  readonly gateway: ExecutionSystem;
  readonly keys: KeyProvider;
  readonly signerKeyId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly crypto: CryptoProvider;
  readonly authorizationTtlSeconds?: number;
  readonly amountChangeThreshold?: number;
  readonly stageOrder?: readonly string[];
}

/**
 * Signal keys this verifier independently re-derives from a real
 * HubSpot deal fetch and compares against the caller-declared value.
 * Deliberately excludes proposedDealStage/proposedAmount (already
 * proven, by SignalIntentBinder, to equal parameters.dealstage/
 * parameters.amount before this verifier ever runs) and
 * preAuthorizedForAmountChange (an out-of-band claim with no
 * HubSpot-side equivalent to fetch and compare against -- see
 * HubSpotDealUpdateSignals.ts's own comment on that field; this
 * mirrors razorpay-refund's exclusion of dailyCumulativeAfterThis
 * RefundPaise for the same reason).
 */
const VERIFIED_SIGNAL_KEYS = [
  "currentDealStage",
  "dealStageChangeRequested",
  "dealStageTransitionAllowed",
  "amountChangeRequested",
  "amountDeltaAbs",
  "amountChangeExceedsThreshold",
] as const;

/**
 * G-24 residual closure (RFC-0022), hubspot-deal-update slice:
 * independently verifies the hubspot-deal-update policy's signals
 * against a real HubSpot deal fetch, immediately before
 * PolicyEngine.evaluate's result would otherwise be trusted verbatim.
 *
 * Reuses exactly the fetch HubSpotDealUpdateService already performs
 * -- executeHubSpotCapability against HUBSPOT_DEAL_FETCH_CAPABILITY,
 * buildHubSpotDealUpdateSignals to derive the canonical facts -- so
 * "verified" here means the same thing it already means there.
 * Mirrors RazorpaySignalStateVerifier's structure exactly.
 *
 * Fails closed: a fetch error (network failure, malformed response,
 * deal not found) becomes a violation, not a pass-through -- a
 * request whose real state cannot be confirmed is refused, never
 * approved on faith in the caller's own claim.
 */
export class HubSpotSignalStateVerifier implements SignalStateVerifier {
  constructor(private readonly options: HubSpotSignalStateVerifierOptions) {}

  async findViolations(
    request: SignalStateVerificationRequest,
    signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    if (request.action !== HUBSPOT_DEAL_UPDATE_CAPABILITY) {
      return [];
    }

    const dealId = request.intentParameters?.dealId;

    if (typeof dealId !== "string" || dealId.length === 0) {
      return [
        {
          signalKey: "dealId",
          declaredValue: dealId,
          actualValue: "<missing: parameters.dealId is required to verify deal state>",
        },
      ];
    }

    let deal: HubSpotDeal;

    try {
      const signerPrivateKey = await this.options.keys.getPrivateKey(this.options.signerKeyId);

      const fetchResult = await executeHubSpotCapability(
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
          action: HUBSPOT_DEAL_FETCH_CAPABILITY,
          target: `deals/${dealId}`,
          parameters: { dealId },
        },
      );

      deal = hubSpotConnectorResponseMetadata(fetchResult).deal as HubSpotDeal;
    } catch (error) {
      return [
        {
          signalKey: "hubspot:deal-fetch",
          declaredValue: "<declared signals, unverifiable>",
          actualValue: `<verification failed: ${error instanceof Error ? error.message : String(error)}>`,
        },
      ];
    }

    const proposedDealStage = signals.proposedDealStage;
    const proposedAmount = signals.proposedAmount;

    const verified = buildHubSpotDealUpdateSignals({
      currentDeal: deal,
      ...(typeof proposedDealStage === "string" ? { proposedDealStage } : {}),
      ...(typeof proposedAmount === "number" ? { proposedAmount } : {}),
      ...(this.options.amountChangeThreshold !== undefined
        ? { amountChangeThreshold: this.options.amountChangeThreshold }
        : {}),
      ...(this.options.stageOrder !== undefined ? { stageOrder: this.options.stageOrder } : {}),
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
