import { randomUUID, type KeyObject } from "node:crypto";

import { AuthorizationSigner, type CryptoProvider } from "@parmana/crypto";
import type { ExecutionGateway } from "@parmana/execution-gateway";
import type { ExecutionRequest } from "@parmana/execution-system";
import { PolicyEngine, PolicyOutcome, type Policy } from "@parmana/policy";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";

import { RAZORPAY_PAYMENT_FETCH_CAPABILITY, RAZORPAY_REFUND_CREATE_CAPABILITY } from "./RazorpayConnector.js";
import type { RazorpayCumulativeRefundLedger } from "./RazorpayCumulativeRefundLedger.js";
import { buildRazorpayRefundReceipt, type RazorpayRefundReceipt } from "./RazorpayRefundReceipt.js";
import { buildRazorpayRefundSignals } from "./RazorpayRefundSignals.js";
import type { RazorpayPayment, RazorpayRefund } from "./RazorpayTypes.js";

export interface RazorpayRefundServiceOptions {
  readonly gateway: ExecutionGateway;
  readonly signerPrivateKey: KeyObject;
  readonly signerKeyId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly policy: Policy;
  readonly ledger: RazorpayCumulativeRefundLedger;
  readonly crypto: CryptoProvider;
  readonly authorizationTtlSeconds?: number;
}

export interface RequestRazorpayRefundInput {
  /** Parmana's own transaction id. Requesting a refund twice with the same id never re-executes. */
  readonly businessTransactionId: string;
  readonly paymentId: string;
  /** Omit for a full refund of the remaining refundable amount. */
  readonly amountPaise?: number;
  readonly reason: string;
  /** Groups refunds for the daily cumulative cap (e.g. a session or merchant id). */
  readonly scopeId: string;
}

export interface RazorpayRefundOutcome {
  readonly receipt: RazorpayRefundReceipt;
  /** True when this call was answered entirely from the local outcome cache: no HTTP call was made. */
  readonly replayed: boolean;
}

/**
 * Orchestrates one guarded Razorpay refund: fetches the payment, evaluates
 * the razorpay-refund policy pack deterministically against the fetched
 * state, and only on approval signs and executes the refund-create
 * capability through the existing signed-authorization / Execution Gateway
 * / SessionCredentialSecureConnector pipeline, unmodified.
 *
 * A repeated call with the same businessTransactionId is answered from an
 * in-memory outcome cache before anything else runs: no payment fetch, no
 * policy evaluation, and no HTTP call to Razorpay. This is stronger than,
 * and separate from, the connector's own list-refunds idempotency check
 * (RazorpayConnector.createRefund), which guards the case where this
 * cache is empty (e.g. after a process restart) but Razorpay already
 * recorded the refund.
 */
export class RazorpayRefundService {
  private readonly outcomes = new Map<string, RazorpayRefundReceipt>();
  private readonly policyEngine = new PolicyEngine();
  private readonly signer: AuthorizationSigner;

  constructor(private readonly options: RazorpayRefundServiceOptions) {
    this.signer = new AuthorizationSigner(options.crypto);
  }

  async requestRefund(input: RequestRazorpayRefundInput): Promise<RazorpayRefundOutcome> {
    const cached = this.outcomes.get(input.businessTransactionId);
    if (cached !== undefined) {
      return { receipt: cached, replayed: true };
    }

    const fetchResult = await this.executeCapability({
      businessTransactionId: `${input.businessTransactionId}:payment-fetch`,
      action: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
      target: `payments/${input.paymentId}`,
      parameters: { paymentId: input.paymentId },
    });

    const payment = connectorResponseMetadata(fetchResult).payment as RazorpayPayment;
    const requestedRefundAmountPaise = input.amountPaise ?? payment.amount - payment.amount_refunded;
    const dailyCumulativeSoFarPaise = this.options.ledger.cumulativeAmountToday(input.scopeId);

    const signals = buildRazorpayRefundSignals({
      payment,
      requestedRefundAmountPaise,
      dailyCumulativeSoFarPaise,
    });

    const decision = this.policyEngine.evaluate(this.options.policy, signals);

    if (decision.outcome !== PolicyOutcome.APPROVE) {
      const receipt = await buildRazorpayRefundReceipt({
        businessTransactionId: input.businessTransactionId,
        approved: false,
        paymentId: input.paymentId,
        policyDecision: decision,
        crypto: this.options.crypto,
        issuedAt: new Date(),
      });
      this.outcomes.set(input.businessTransactionId, receipt);
      return { receipt, replayed: false };
    }

    const refundResult = await this.executeCapability({
      businessTransactionId: input.businessTransactionId,
      action: RAZORPAY_REFUND_CREATE_CAPABILITY,
      target: `payments/${input.paymentId}/refund`,
      parameters: {
        paymentId: input.paymentId,
        ...(input.amountPaise !== undefined ? { amountPaise: input.amountPaise } : {}),
        reason: input.reason,
      },
    });

    const refundMetadata = connectorResponseMetadata(refundResult);
    const refund = refundMetadata.refund as RazorpayRefund;
    const connectorEvidence = refundResult.metadata?.connector as { connectorEvidenceHash?: string } | undefined;
    const keyIdRedacted = typeof refundMetadata.keyIdRedacted === "string" ? refundMetadata.keyIdRedacted : undefined;

    this.options.ledger.recordApprovedRefund(input.scopeId, requestedRefundAmountPaise, input.businessTransactionId);

    const receipt = await buildRazorpayRefundReceipt({
      businessTransactionId: input.businessTransactionId,
      approved: true,
      paymentId: input.paymentId,
      policyDecision: decision,
      razorpayIdempotent: refundMetadata.idempotent === true,
      refund,
      crypto: this.options.crypto,
      issuedAt: new Date(),
      ...(keyIdRedacted !== undefined ? { keyIdRedacted } : {}),
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
