import { randomUUID, type KeyObject } from "node:crypto";

import { AuthorizationSigner, type CryptoProvider } from "@parmana/crypto";
import type { ExecutionGateway } from "@parmana/execution-gateway";
import type { ExecutionRequest } from "@parmana/execution-system";
import { PolicyEngine, PolicyOutcome, type Policy } from "@parmana/policy";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";

import { HUBSPOT_DEAL_FETCH_CAPABILITY, HUBSPOT_DEAL_UPDATE_CAPABILITY } from "./HubSpotConnector.js";
import { buildHubSpotDealUpdateSignals } from "./HubSpotDealUpdateSignals.js";
import { buildHubSpotDealUpdateReceipt, type HubSpotDealUpdateReceipt } from "./HubSpotDealUpdateReceipt.js";
import type { HubSpotDeal } from "./HubSpotTypes.js";

export interface HubSpotDealUpdateServiceOptions {
  readonly gateway: ExecutionGateway;
  readonly signerPrivateKey: KeyObject;
  readonly signerKeyId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly policy: Policy;
  readonly crypto: CryptoProvider;
  readonly authorizationTtlSeconds?: number;
  readonly amountChangeThreshold?: number;
  readonly stageOrder?: readonly string[];
}

export interface RequestHubSpotDealUpdateInput {
  /** Parmana's own transaction id. Requesting the same update twice with the same id never re-executes. */
  readonly businessTransactionId: string;
  readonly dealId: string;
  readonly proposedDealStage?: string;
  readonly proposedAmount?: number;
  readonly preAuthorizedForAmountChange?: boolean;
}

export interface HubSpotDealUpdateOutcome {
  readonly receipt: HubSpotDealUpdateReceipt;
  /** True when this call was answered entirely from the local outcome cache: no HTTP call was made. */
  readonly replayed: boolean;
}

/**
 * Orchestrates one guarded HubSpot deal update: fetches the deal,
 * evaluates the hubspot-deal-update policy pack deterministically
 * against the fetched current state and the proposed change, and only
 * on approval signs and executes the deal-update capability through the
 * existing signed-authorization / Execution Gateway /
 * SessionCredentialSecureConnector pipeline, unmodified.
 *
 * This is test/tutorial-only wiring, following exactly the same
 * production-reachability caveat RazorpayRefundService documents: the
 * production API path (POST /execute) evaluates policy against
 * caller-supplied signals through the generic mechanism every other
 * capability-routed connector uses, not through this fetch-then-evaluate
 * flow. See docs/CLAIMS.md for the precise scope of each path.
 *
 * A repeated call with the same businessTransactionId is answered from
 * an in-memory outcome cache before anything else runs: no deal fetch,
 * no policy evaluation, and no HTTP call to HubSpot.
 */
export class HubSpotDealUpdateService {
  private readonly outcomes = new Map<string, HubSpotDealUpdateReceipt>();
  private readonly policyEngine = new PolicyEngine();
  private readonly signer: AuthorizationSigner;

  constructor(private readonly options: HubSpotDealUpdateServiceOptions) {
    this.signer = new AuthorizationSigner(options.crypto);
  }

  async requestDealUpdate(input: RequestHubSpotDealUpdateInput): Promise<HubSpotDealUpdateOutcome> {
    const cached = this.outcomes.get(input.businessTransactionId);
    if (cached !== undefined) {
      return { receipt: cached, replayed: true };
    }

    const fetchResult = await this.executeCapability({
      businessTransactionId: `${input.businessTransactionId}:deal-fetch`,
      action: HUBSPOT_DEAL_FETCH_CAPABILITY,
      target: `deals/${input.dealId}`,
      parameters: { dealId: input.dealId },
    });

    const deal = connectorResponseMetadata(fetchResult).deal as HubSpotDeal;

    const signals = buildHubSpotDealUpdateSignals({
      currentDeal: deal,
      ...(input.proposedDealStage !== undefined ? { proposedDealStage: input.proposedDealStage } : {}),
      ...(input.proposedAmount !== undefined ? { proposedAmount: input.proposedAmount } : {}),
      ...(input.preAuthorizedForAmountChange !== undefined
        ? { preAuthorizedForAmountChange: input.preAuthorizedForAmountChange }
        : {}),
      ...(this.options.amountChangeThreshold !== undefined
        ? { amountChangeThreshold: this.options.amountChangeThreshold }
        : {}),
      ...(this.options.stageOrder !== undefined ? { stageOrder: this.options.stageOrder } : {}),
    });

    const decision = this.policyEngine.evaluate(this.options.policy, signals);

    if (decision.outcome !== PolicyOutcome.APPROVE) {
      const receipt = await buildHubSpotDealUpdateReceipt({
        businessTransactionId: input.businessTransactionId,
        approved: false,
        dealId: input.dealId,
        ...(input.proposedDealStage !== undefined ? { proposedDealStage: input.proposedDealStage } : {}),
        ...(input.proposedAmount !== undefined ? { proposedAmount: input.proposedAmount } : {}),
        policyDecision: decision,
        crypto: this.options.crypto,
        issuedAt: new Date(),
      });
      this.outcomes.set(input.businessTransactionId, receipt);
      return { receipt, replayed: false };
    }

    const updateResult = await this.executeCapability({
      businessTransactionId: input.businessTransactionId,
      action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
      target: `deals/${input.dealId}`,
      parameters: {
        dealId: input.dealId,
        ...(input.proposedDealStage !== undefined ? { dealstage: input.proposedDealStage } : {}),
        ...(input.proposedAmount !== undefined ? { amount: input.proposedAmount } : {}),
      },
    });

    const updateMetadata = connectorResponseMetadata(updateResult);
    const updatedDeal = updateMetadata.deal as HubSpotDeal;
    const connectorEvidence = updateResult.metadata?.connector as { connectorEvidenceHash?: string } | undefined;
    const bearerRedacted = typeof updateMetadata.bearerRedacted === "string" ? updateMetadata.bearerRedacted : undefined;

    const receipt = await buildHubSpotDealUpdateReceipt({
      businessTransactionId: input.businessTransactionId,
      approved: true,
      dealId: input.dealId,
      ...(input.proposedDealStage !== undefined ? { proposedDealStage: input.proposedDealStage } : {}),
      ...(input.proposedAmount !== undefined ? { proposedAmount: input.proposedAmount } : {}),
      deal: updatedDeal,
      policyDecision: decision,
      crypto: this.options.crypto,
      issuedAt: new Date(),
      ...(bearerRedacted !== undefined ? { bearerRedacted } : {}),
      ...(connectorEvidence?.connectorEvidenceHash !== undefined
        ? { connectorEvidenceHash: connectorEvidence.connectorEvidenceHash }
        : {}),
    });

    this.outcomes.set(input.businessTransactionId, receipt);
    return { receipt, replayed: false };
  }

  private async executeCapability(content: {
    readonly businessTransactionId: string;
    readonly action: string;
    readonly target: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  }): Promise<ExecutionResult> {
    const executableContent: ExecutableContent = Object.freeze({
      ...content,
      parameters: Object.freeze({ ...content.parameters }),
    });

    const authorization = await this.signer.sign(
      {
        decisionId: randomUUID(),
        businessTransactionId: content.businessTransactionId,
        policyName: this.options.policyName,
        policyVersion: this.options.policyVersion,
        executableContent,
      },
      this.options.signerPrivateKey,
      this.options.signerKeyId,
      this.options.authorizationTtlSeconds ?? 60,
    );

    const request: ExecutionRequest = {
      businessTransactionId: content.businessTransactionId,
      action: content.action,
      target: content.target,
      parameters: content.parameters,
      authorization,
    };

    return this.options.gateway.execute(request);
  }
}

function connectorResponseMetadata(result: ExecutionResult): Record<string, unknown> {
  const connector = result.metadata?.connector as
    | { responseSummary?: { metadata?: Record<string, unknown> } }
    | undefined;
  return connector?.responseSummary?.metadata ?? {};
}
