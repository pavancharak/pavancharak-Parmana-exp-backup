import type { KeyObject } from "node:crypto";

import {
  HybridSigner,
  TrustRecordHasher,
  type HybridCryptoProvider,
} from "@parmana/crypto";

import type {
  ExecutionTrustRecord,
} from "./models/ExecutionTrustRecord.js";

/**
 * Builds immutable Execution Trust Records.
 */
export class ExecutionTrustRecordBuilder {
  constructor(
    private readonly crypto: HybridCryptoProvider,
  ) {}

  async build(
    artifact: unknown,
    primaryPrivateKey: KeyObject,
    secondaryPrivateKey: KeyObject,
    primaryKeyId: string,
    secondaryKeyId: string,
    gatewayId: string,
    policyVersion: string,
    timestamp: string,
  ): Promise<ExecutionTrustRecord> {
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
      artifactHash,
      signatures,
      gatewayId,
      policyVersion,
      timestamp,
    });
  }
}