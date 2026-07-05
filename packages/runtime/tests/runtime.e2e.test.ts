import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BusinessTransaction,
  BusinessTransactionStatus,
} from "@parmana/shared";

import {
  FilePolicyRepository,
  PolicyEngine,
  PolicyRouter,
} from "@parmana/policy";

import { DecisionBuilder } from "../src/DecisionBuilder.js";
import { ExecutionBuilder } from "../src/ExecutionBuilder.js";
import { ExecutionGate } from "../src/ExecutionGate.js";
import { ExecutionTrustPipeline } from "../src/ExecutionTrustPipeline.js";
import { RuntimeAuthorizationSigner } from "../src/RuntimeAuthorizationSigner.js";
import { RuntimeEngine } from "../src/RuntimeEngine.js";
import { RuntimeExecutionPermitService } from "../src/RuntimeExecutionPermitService.js";
import { RuntimePipeline } from "../src/RuntimePipeline.js";

/**
 * RuntimeEngine End-to-End tests.
 */
describe("RuntimeEngine E2E", () => {
  const policyRepository =
    new FilePolicyRepository(
      path.resolve(
        import.meta.dirname,
        "../../../policies",
      ),
    );

  const router =
    new PolicyRouter(
      policyRepository,
    );

  const pipeline =
    new RuntimePipeline([]);

  const policyEngine =
    new PolicyEngine();

  const trustPipeline =
    new ExecutionTrustPipeline();

  const authorizationSigner =
    new RuntimeAuthorizationSigner();

  const executionPermitService =
    new RuntimeExecutionPermitService();

  it(
    "executes full trust pipeline deterministically",
    async () => {
      const transaction: BusinessTransaction = {
        businessTransactionId: "tx-1",

        metadata: {
          executionMode: "SYNC",
        } as any,

        authority: {} as any,

        authorization: {} as any,

        intent: {
          intentId: "intent-1",
        } as any,

        policy: {
          name: "vendor-payment",
          version: "2.0.0",
          schemaVersion: "1.0.0",
        },

        signals: {
          vendorVerified: true,
          invoiceVerified: true,
          paymentApproved: true,
          sufficientFunds: true,
          paymentAmount: 100,
          riskScore: 10,
        },

        status:
          BusinessTransactionStatus.RECEIVED,

        createdAt:
          new Date(),
      };

      const runtime =
        new RuntimeEngine(
          pipeline,
          router,
          policyEngine,
          new DecisionBuilder(),
          new ExecutionGate(),
          new ExecutionBuilder(),
          trustPipeline,
          authorizationSigner,
          executionPermitService,
          120,
        );

      const result =
        await runtime.execute(
          transaction,
        );

      expect(
        result.transaction,
      ).toBeDefined();

      expect(
        result.context,
      ).toBeDefined();

      expect(
        result.trustRecord,
      ).toBeDefined();

      expect(
        result.trustRecord
          .businessTransactionId,
      ).toBe(
        transaction.businessTransactionId,
      );
    },
  );

  it(
    "fails safely on invalid transaction",
    async () => {
      const runtime =
        new RuntimeEngine(
          pipeline,
          router,
          policyEngine,
          new DecisionBuilder(),
          new ExecutionGate(),
          new ExecutionBuilder(),
          trustPipeline,
          authorizationSigner,
          executionPermitService,
          120,
        );

      await expect(
        runtime.execute(
          {} as BusinessTransaction,
        ),
      ).rejects.toThrow();
    },
  );
});