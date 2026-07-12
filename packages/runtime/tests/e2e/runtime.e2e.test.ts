import path from "node:path";
import { DecisionBuilder } from "../../src/DecisionBuilder.js";
import { ExecutionBuilder } from "../../src/ExecutionBuilder.js";
import { ExecutionGate } from "../../src/ExecutionGate.js";
import { describe, expect, it } from "vitest";

import {
  Authority,
  Authorization,
  BusinessTransaction,
  BusinessTransactionStatus,
  TransactionMetadata,
} from "@parmana/shared";

import {
  FilePolicyRepository,
  PolicyEngine,
  PolicyRouter,
} from "@parmana/policy";

import { RuntimeEngine } from "../../src/RuntimeEngine.js";
import { RuntimePipeline } from "../../src/RuntimePipeline.js";
import { BusinessTrustPipeline } from "../../src/BusinessTrustPipeline.js";
import { RuntimeAuthorizationSigner } from "../../src/RuntimeAuthorizationSigner.js";

/**
 * RuntimeEngine End-to-End tests.
 */
describe("RuntimeEngine E2E", () => {
  const policyRepository = new FilePolicyRepository(
    path.resolve(import.meta.dirname, "../../../../policies"),
  );

  const router = new PolicyRouter(
  policyRepository,
);
const pipeline = new RuntimePipeline([]);

  const policyEngine = new PolicyEngine();

  const trustPipeline =
    new BusinessTrustPipeline();

  const authorizationSigner =
    new RuntimeAuthorizationSigner();

  it(
    "executes full trust pipeline deterministically",
    async () => {
      const transaction: BusinessTransaction = {
        businessTransactionId: "tx-1",

        //
        // executionMode is not a TransactionMetadata field;
        // this fixture is deliberately loose and never read
        // by the code under test, hence the unknown cast.
        //
        metadata: {
          executionMode: "SYNC",
        } as unknown as TransactionMetadata,

        authority: {} as Authority,

        authorization: {} as Authorization,

      intent: {
  intentId: "intent-1",
  authorizationId: "authorization-1",
  action: "payments:execute",
  target: "vendor://payments",
  parameters: {
    amount: 100,
  },
  createdAt: new Date(),
},

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

        createdAt: new Date(),
      };

      const runtime = new RuntimeEngine(
  pipeline,
  router,
  policyEngine,
  new DecisionBuilder(),
  new ExecutionGate(),
  new ExecutionBuilder(),
  trustPipeline,
  authorizationSigner,
  120,
);

      const result =
        await runtime.execute(transaction);

      expect(result.transaction).toBeDefined();
      expect(result.context).toBeDefined();
      expect(result.trustRecord).toBeDefined();

      expect(
        result.trustRecord.businessTransactionId,
      ).toBe(
        transaction.businessTransactionId,
      );
    },
  );

  it(
    "fails safely on invalid transaction",
    async () => {
const runtime = new RuntimeEngine(
  pipeline,
  router,
  policyEngine,
  new DecisionBuilder(),
  new ExecutionGate(),
  new ExecutionBuilder(),
  trustPipeline,
  authorizationSigner,
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

