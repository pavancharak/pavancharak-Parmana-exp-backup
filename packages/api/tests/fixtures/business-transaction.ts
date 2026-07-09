 import type { BusinessTransaction } from "@parmana/shared";
import { TEST_POLICY } from "./policies.js";
export function createBusinessTransaction(): BusinessTransaction {
  const businessTransactionId = crypto.randomUUID();

  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();

  return {
    businessTransactionId,

    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "integration-test",
      createdAt: new Date(),
    },

    authority: {
      authorityId,
      authorityType: "USER",
      principalId: "integration-test",
      displayName: "Integration Test",
      issuedAt: new Date(),
    },

    authorization: {
      authorizationId,
      authorityId,
      purpose: "Integration Test",
      authorizedAt: new Date(),
    },

intent: {
  intentId,
  authorizationId,

  action: "payments:execute",

  target: "vendor://payments",

  parameters: Object.freeze({
    paymentId: "payment-001",
    amount: 1000,
  }),

  createdAt: new Date(),
},
policy: TEST_POLICY,
signals: {
  vendorVerified: true,
  invoiceVerified: true,
  paymentApproved: true,
  sufficientFunds: true,
  paymentAmount: 1000,
  riskScore: 10,
},

    decision: {
      outcome: "APPROVED",
    },

    status: "APPROVED",

    createdAt: new Date(),
  };
}

