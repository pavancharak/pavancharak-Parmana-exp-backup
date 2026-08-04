import type { KeyObject } from "node:crypto";
import { randomUUID } from "node:crypto";

import { AuthorizationSigner, type CryptoProvider } from "@parmana/crypto";
import type { ExecutionSystem } from "@parmana/execution-system";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";

export interface RazorpayCapabilityExecutionOptions {
  readonly gateway: ExecutionSystem;
  readonly signerPrivateKey: KeyObject;
  readonly signerKeyId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly crypto: CryptoProvider;
  readonly authorizationTtlSeconds?: number;
}

export interface RazorpayCapabilityExecutionContent {
  readonly businessTransactionId: string;
  readonly action: string;
  readonly target: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/**
 * Signs and executes one Razorpay capability call: fresh authorization,
 * signed with the caller-supplied key, submitted through the caller-
 * supplied ExecutionSystem (envelope verification, nonce consumption,
 * connector dispatch -- unmodified, the same gateway every other
 * execution goes through).
 *
 * Extracted from RazorpayRefundService, which was the first and, until
 * G-24's residual closure, only caller of this exact sequence. Both
 * RazorpayRefundService (authorizing the refund it is about to place)
 * and RazorpaySignalStateVerifier (independently re-fetching payment
 * state before policy evaluation) call this, so the sign-then-execute
 * shape exists in exactly one place.
 */
export async function executeRazorpayCapability(
  options: RazorpayCapabilityExecutionOptions,
  content: RazorpayCapabilityExecutionContent,
): Promise<ExecutionResult> {
  const signer = new AuthorizationSigner(options.crypto);

  const executableContent: ExecutableContent = Object.freeze({
    ...content,
    parameters: Object.freeze({ ...content.parameters }),
  });

  const authorization = await signer.sign(
    {
      decisionId: randomUUID(),
      businessTransactionId: content.businessTransactionId,
      policyName: options.policyName,
      policyVersion: options.policyVersion,
      executableContent,
    },
    options.signerPrivateKey,
    options.signerKeyId,
    options.authorizationTtlSeconds ?? 60,
  );

  return options.gateway.execute({
    businessTransactionId: content.businessTransactionId,
    action: content.action,
    target: content.target,
    parameters: content.parameters,
    authorization,
  });
}

/** Unwraps the connector-reported metadata a capability response carries. */
export function razorpayConnectorResponseMetadata(result: ExecutionResult): Record<string, unknown> {
  const connector = result.metadata?.connector as
    | { responseSummary?: { metadata?: Record<string, unknown> } }
    | undefined;
  return connector?.responseSummary?.metadata ?? {};
}
