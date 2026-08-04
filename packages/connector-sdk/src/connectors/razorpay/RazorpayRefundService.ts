import type { KeyObject } from "node:crypto";

import type { CryptoProvider } from "@parmana/crypto";
import type { ExecutionGateway } from "@parmana/execution-gateway";
import { PolicyEngine, PolicyOutcome, type Policy } from "@parmana/policy";

import { RAZORPAY_PAYMENT_FETCH_CAPABILITY, RAZORPAY_REFUND_CREATE_CAPABILITY } from "./RazorpayConnector.js";
import type { RazorpayCumulativeRefundLedger } from "./RazorpayCumulativeRefundLedger.js";
import { executeRazorpayCapability, razorpayConnectorResponseMetadata } from "./RazorpayCapabilityExecution.js";
import { buildRazorpayRefundReceipt, type RazorpayRefundReceipt } from "./RazorpayRefundReceipt.js";
import { buildRazorpayRefundSignals, RAZORPAY_DEFAULT_DAILY_CUMULATIVE_CAP_PAISE } from "./RazorpayRefundSignals.js";
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
  /**
   * MUST match the policy's own "reject-exceeds-daily-cumulative-cap"
   * rule value -- see RAZORPAY_DEFAULT_DAILY_CUMULATIVE_CAP_PAISE's own
   * comment for why this coupling isn't mechanically enforced.
   */
  readonly dailyCumulativeCapPaise?: number;
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

  constructor(private readonly options: RazorpayRefundServiceOptions) {}

  async requestRefund(input: RequestRazorpayRefundInput): Promise<RazorpayRefundOutcome> {
    const cached = this.outcomes.get(input.businessTransactionId);
    if (cached !== undefined) {
      return { receipt: cached, replayed: true };
    }

    const fetchResult = await executeRazorpayCapability(this.options, {
      businessTransactionId: `${input.businessTransactionId}:payment-fetch`,
      action: RAZORPAY_PAYMENT_FETCH_CAPABILITY,
      target: `payments/${input.paymentId}`,
      parameters: { paymentId: input.paymentId },
    });

    const payment = razorpayConnectorResponseMetadata(fetchResult).payment as RazorpayPayment;
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

    //
    // Daily-cumulative-cap race guard: dailyCumulativeSoFarPaise above
    // was read before this call's own payment fetch and policy
    // evaluation, so a concurrent requestRefund() for the same scopeId
    // could have been recorded in the meantime. Re-checks and reserves
    // atomically -- one synchronous call, no `await` inside it -- right
    // before the refund actually executes, closing that window. A
    // rejection here means a concurrent request already consumed the
    // remaining headroom; this request is refused before Razorpay is
    // ever contacted, the same "zero external calls on a denial" shape
    // every other REJECT path in this service already has.
    //
    const capPaise = this.options.dailyCumulativeCapPaise ?? RAZORPAY_DEFAULT_DAILY_CUMULATIVE_CAP_PAISE;

    const reserved = this.options.ledger.recordApprovedRefundIfWithinCap(
      input.scopeId,
      requestedRefundAmountPaise,
      input.businessTransactionId,
      capPaise,
    );

    if (reserved === null) {
      const raceDecision = {
        ...decision,
        outcome: PolicyOutcome.REJECT,
        reason:
          `Rejected: recording this refund would exceed the daily cumulative cap of ${capPaise} paise ` +
          `for scope "${input.scopeId}" -- a concurrent request already consumed the remaining headroom ` +
          "since this request's signals were evaluated.",
        matchedRuleId: "reject-exceeds-daily-cumulative-cap-race-guard",
      };

      const receipt = await buildRazorpayRefundReceipt({
        businessTransactionId: input.businessTransactionId,
        approved: false,
        paymentId: input.paymentId,
        policyDecision: raceDecision,
        crypto: this.options.crypto,
        issuedAt: new Date(),
      });
      this.outcomes.set(input.businessTransactionId, receipt);
      return { receipt, replayed: false };
    }

    const refundResult = await executeRazorpayCapability(this.options, {
      businessTransactionId: input.businessTransactionId,
      action: RAZORPAY_REFUND_CREATE_CAPABILITY,
      target: `payments/${input.paymentId}/refund`,
      parameters: {
        paymentId: input.paymentId,
        ...(input.amountPaise !== undefined ? { amountPaise: input.amountPaise } : {}),
        reason: input.reason,
      },
    });

    const refundMetadata = razorpayConnectorResponseMetadata(refundResult);
    const refund = refundMetadata.refund as RazorpayRefund;
    const connectorEvidence = refundResult.metadata?.connector as { connectorEvidenceHash?: string } | undefined;
    const keyIdRedacted = typeof refundMetadata.keyIdRedacted === "string" ? refundMetadata.keyIdRedacted : undefined;

    // Already recorded atomically by recordApprovedRefundIfWithinCap above,
    // before this capability call -- not here. Recording after execution
    // would reopen the exact race this guard exists to close.

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
}
