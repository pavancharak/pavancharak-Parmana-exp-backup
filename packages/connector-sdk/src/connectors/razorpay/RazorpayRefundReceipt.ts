import type { CryptoProvider } from "@parmana/crypto";
import { TrustRecordHasher } from "@parmana/crypto";
import type { PolicyDecision } from "@parmana/policy";

import type { RazorpayRefund } from "./RazorpayTypes.js";

/**
 * Receipt for one Razorpay refund request, approved or denied. Never
 * contains key_secret. key_id, if present, is redacted to a one-way
 * SHA-256 fingerprint (see redactRazorpayKeyId), never a literal
 * substring of the credential.
 */
export interface RazorpayRefundReceipt {
  readonly version: 1;
  readonly businessTransactionId: string;
  readonly approved: boolean;
  readonly paymentId: string;
  readonly razorpayRefundId?: string;
  readonly amountPaise?: number;

  /** True when Razorpay's own refund list already carried a refund tagged with this transaction id. */
  readonly razorpayIdempotent: boolean;

  readonly policyDecision: PolicyDecision;
  readonly keyIdRedacted?: string;
  readonly connectorEvidenceHash?: string;
  readonly issuedAt: string;
  readonly receiptHash: string;
}

export interface BuildRazorpayRefundReceiptOptions {
  readonly businessTransactionId: string;
  readonly approved: boolean;
  readonly paymentId: string;
  readonly policyDecision: PolicyDecision;
  readonly razorpayIdempotent?: boolean;

  /** Already-redacted by the connector, which is the only layer that ever holds the raw key_id. */
  readonly keyIdRedacted?: string;
  readonly refund?: RazorpayRefund;
  readonly connectorEvidenceHash?: string;
  readonly crypto: CryptoProvider;
  readonly issuedAt: Date;
}

export async function buildRazorpayRefundReceipt(
  options: BuildRazorpayRefundReceiptOptions,
): Promise<RazorpayRefundReceipt> {
  const hasher = new TrustRecordHasher(options.crypto);

  const unhashed = {
    version: 1 as const,
    businessTransactionId: options.businessTransactionId,
    approved: options.approved,
    paymentId: options.paymentId,
    ...(options.refund !== undefined
      ? { razorpayRefundId: options.refund.id, amountPaise: options.refund.amount }
      : {}),
    razorpayIdempotent: options.razorpayIdempotent ?? false,
    policyDecision: options.policyDecision,
    ...(options.keyIdRedacted !== undefined ? { keyIdRedacted: options.keyIdRedacted } : {}),
    ...(options.connectorEvidenceHash !== undefined
      ? { connectorEvidenceHash: options.connectorEvidenceHash }
      : {}),
    issuedAt: options.issuedAt.toISOString(),
  };

  const receiptHash = await hasher.hash(unhashed);

  return Object.freeze({ ...unhashed, receiptHash });
}
