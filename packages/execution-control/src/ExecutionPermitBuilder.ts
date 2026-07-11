import type { KeyObject } from "node:crypto";
import { ExecutionDecision } from "./models/ExecutionDecision.js";
import {
  HybridSigner,
  TrustRecordHasher,
  type HybridCryptoProvider,
} from "@parmana/crypto";

import type {
  ExecutionPermit,
} from "./models/ExecutionPermit.js";

/**
 * Builds immutable Execution Permits.
 *
 * Policy evaluation happens BEFORE this builder.
 */
export class ExecutionPermitBuilder {
  constructor(
    private readonly crypto: HybridCryptoProvider,
  ) {}

  async build(
    artifact: unknown,
    decision: ExecutionDecision,
    primaryPrivateKey: KeyObject,
    secondaryPrivateKey: KeyObject,
    primaryKeyId: string,
    secondaryKeyId: string,
    permitId: string,
    gatewayId: string,
    policyVersion: string,
    issuedAt: string,
    expiresAt: string,
  ): Promise<ExecutionPermit> {
    const artifactHash =
      await new TrustRecordHasher(
        this.crypto.primary,
      ).hash(
        artifact,
      );

    const signatures =
      await new HybridSigner(
        this.crypto,
      ).sign(
        artifact,
        primaryPrivateKey,
        secondaryPrivateKey,
        primaryKeyId,
        secondaryKeyId,
      );

    return Object.freeze({
      permitId,
      artifactHash,
      gatewayId,
      policyVersion,
      decision,
      issuedAt,
      expiresAt,
      signatures,
    });
  }
}