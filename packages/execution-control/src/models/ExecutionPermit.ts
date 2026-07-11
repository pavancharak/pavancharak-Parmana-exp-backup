import type { SignatureBundle } from "@parmana/crypto";
import { ExecutionDecision } from "./ExecutionDecision.js";
export interface ExecutionPermit {
  readonly permitId: string;

  readonly artifactHash: string;

  readonly gatewayId: string;

  readonly policyVersion: string;

readonly decision: ExecutionDecision;

  readonly issuedAt: string;

  readonly expiresAt: string;

  readonly signatures: SignatureBundle;
}