/**
 * Parmana TypeScript SDK
 *
 * Real-server integration test.
 *
 * Boots the actual @parmana/api Express application (real
 * StaticKeyAuthenticator, real PolicyEngine, real vendor-payment
 * connector, real Ed25519 signing via the hermetic keys vitest.setup.ts
 * generates), binds it to a real OS-assigned TCP port, and drives it
 * with the real ParmanaClient/HttpTransport over real HTTP — not
 * supertest, not a mock. This is what "verified against a real local
 * parmana-exp instance" means for this SDK.
 *
 * Covers the three gaps this pass fixed, against real responses:
 * 1. Bearer-key auth: an authenticated request succeeds, an
 *    unauthenticated one gets a genuine 401.
 * 2. Error taxonomy: a real validation error, a real policy rejection,
 *    a real not-found, and a real duplicate all throw the correct typed
 *    error, built from what the server actually returned, not an
 *    assumption about what it would return.
 */

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";

import { createApplication } from "../../../packages/api/src/application.js";
import { createApp } from "../../../packages/api/src/app.js";
import { createExecutionSystem } from "../../../packages/api/src/bootstrap/createExecutionSystem.js";
import { StaticKeyAuthenticator } from "../../../packages/api/src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../../packages/api/src/auth/InMemoryCallerAuditSink.js";
import { hashApiKey } from "../../../packages/api/src/auth/hashApiKey.js";

import { ParmanaClient } from "../../src/client/ParmanaClient.js";
import { HttpTransport } from "../../src/transport/HttpTransport.js";
import type { BusinessTransaction } from "../../src/models/index.js";

import { AuthenticationError } from "../../src/errors/AuthenticationError.js";
import { AuthorizationError } from "../../src/errors/AuthorizationError.js";
import { ValidationError } from "../../src/errors/ValidationError.js";
import { ExecutionRejectedError } from "../../src/errors/ExecutionRejectedError.js";
import { NotFoundError } from "../../src/errors/NotFoundError.js";
import { ConflictError } from "../../src/errors/ConflictError.js";

const RAW_API_KEY = "ts-sdk-integration-test-key";

let server: Server;
let endpoint: string;

function buildTransaction(
  overrides: {
    businessTransactionId?: string;
    riskScore?: number;
    paymentAmount?: number;
    target?: string;
    principalId?: string;
  } = {},
): BusinessTransaction {
  const businessTransactionId =
    overrides.businessTransactionId ?? crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const now = new Date();
  const target = overrides.target ?? "vendor/V-ts-sdk";
  const paymentAmount = overrides.paymentAmount ?? 4500;

  return {
    businessTransactionId,

    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      tenantId: null,
      sourceSystem: "typescript-sdk-integration-test",
      submittedBy: "vitest",
      submittedAt: now,
    },

    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId:
        overrides.principalId ?? "typescript-sdk-integration-test",
      displayName: "TypeScript SDK Integration Test",
      issuedAt: now,
    },

    authorization: {
      authorizationId,
      authorityId,
      purpose: "TypeScript SDK integration test",
      issuedAt: now,
    },

    intent: {
      intentId,
      authorizationId,
      action: "payments:execute",
      target,
      parameters: { amount: paymentAmount, currency: "USD" },
      createdAt: now,
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
      paymentAmount,
      riskScore: overrides.riskScore ?? 10,
      // vendor-payment@2.0.0 declares boundSignals: vendorId -> target.
      vendorId: target,
    },

    status: "RECEIVED",
    createdAt: now,
  };
}

beforeAll(async () => {
  process.env.PARMANA_POLICY_DIR = fileURLToPath(
    new URL("../../../policies", import.meta.url),
  );

  process.env.VENDOR_PAYMENT_TOKEN = "ts-sdk-integration-test-token";

  const executionSystem = createExecutionSystem();
  const application = createApplication(executionSystem);

  const authenticator = new StaticKeyAuthenticator([
    {
      callerId: "typescript-sdk-integration-test",
      keyHash: hashApiKey(RAW_API_KEY),
      allowedPrincipalIds: ["typescript-sdk-integration-test"],
    },
  ]);

  const app = createApp(application, {
    callerAuth: {
      authenticator,
      auditSink: new InMemoryCallerAuditSink(),
    },
    razorpayWebhook: "disabled",
  });

  server = await new Promise<Server>((resolve) => {
    const httpServer = app.listen(0, "127.0.0.1", () => {
      resolve(httpServer);
    });
  });

  const address = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function authenticatedClient(): ParmanaClient {
  return new ParmanaClient({
    endpoint,
    apiKey: RAW_API_KEY,
    transport: new HttpTransport({ endpoint, apiKey: RAW_API_KEY }),
  });
}

function unauthenticatedClient(): ParmanaClient {
  return new ParmanaClient({
    endpoint,
    transport: new HttpTransport({ endpoint }),
  });
}

describe("ParmanaClient against a real local @parmana/api instance", () => {
  describe("gap 1: bearer-key authentication", () => {
    it("GET /health succeeds with no apiKey (the one route exempt from auth)", async () => {
      const health = await unauthenticatedClient().health();
      expect(health).toMatchObject({ status: "UP" });
    });

    it("an authenticated request succeeds", async () => {
      const transaction = buildTransaction();
      const trustRecord = await authenticatedClient().execute(transaction);

      expect(trustRecord.businessTransactionId).toBe(
        transaction.businessTransactionId,
      );
      expect(trustRecord.executions).toHaveLength(1);
      expect(trustRecord.executions[0]?.decision.outcome).toBe("APPROVED");
    });

    it("a caller asserting a principalId it is not allowed to assert gets a real 403, thrown as AuthorizationError", async () => {
      const transaction = buildTransaction({
        principalId: "someone-else-entirely",
      });

      let caught: unknown;
      try {
        await authenticatedClient().execute(transaction);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(AuthorizationError);
      expect((caught as AuthorizationError).message).toBe(
        "Caller is not permitted to assert this authority.principalId.",
      );
    });

    it("an unauthenticated request against a route that requires auth gets a real 401, thrown as AuthenticationError", async () => {
      let caught: unknown;
      try {
        await unauthenticatedClient().execute(buildTransaction());
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(AuthenticationError);
      expect((caught as AuthenticationError).message).toBe(
        "authentication required",
      );
    });
  });

  describe("gap 2: real errors map to the correct typed error", () => {
    it("a real validation error (malformed businessTransactionId) throws ValidationError with the server's exact message", async () => {
      const transaction = buildTransaction();
      const malformed = {
        ...transaction,
        businessTransactionId: "not-a-uuid",
      };

      let caught: unknown;
      try {
        await authenticatedClient().execute(malformed);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ValidationError);
      expect((caught as ValidationError).message).toBe(
        "businessTransactionId must be a valid UUID.",
      );
    });

    it("a real policy rejection (riskScore over threshold) throws ExecutionRejectedError with the policy's real reason", async () => {
      const transaction = buildTransaction({ riskScore: 999 });

      let caught: unknown;
      try {
        await authenticatedClient().execute(transaction);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ExecutionRejectedError);
      expect((caught as ExecutionRejectedError).message).toBe(
        "Execution rejected: Vendor payment rejected because the assessed payment risk exceeds the maximum permitted threshold.",
      );
    });

    it("a real not-found (unknown Execution Trust Record) throws NotFoundError", async () => {
      let caught: unknown;
      try {
        await authenticatedClient().trustRecord(crypto.randomUUID());
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotFoundError);
      expect((caught as NotFoundError).message).toBe(
        "Execution Trust Record not found.",
      );
    });

    it("a real duplicate businessTransactionId throws ConflictError", async () => {
      const transaction = buildTransaction();
      const client = authenticatedClient();

      await client.execute(transaction);

      let caught: unknown;
      try {
        await client.execute(transaction);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ConflictError);
      expect((caught as ConflictError).message).toBe(
        `Business Transaction '${transaction.businessTransactionId}' already exists.`,
      );
    });
  });

  describe("completeness gaps closed this audit: version(), verify(), createTransaction()", () => {
    it("version() returns the real GET /version payload", async () => {
      const version = await authenticatedClient().version();
      expect(version).toMatchObject({ name: "Parmana", api: "v1" });
    });

    it("verify() runs a fresh POST /verify and appends a new Verification", async () => {
      const transaction = buildTransaction();
      const client = authenticatedClient();

      const trustRecord = await client.execute(transaction);
      expect(trustRecord.verifications).toHaveLength(1);

      const verification = await client.verify(transaction.businessTransactionId);

      expect(verification.status).toBe("VERIFIED");
      expect(verification.businessTransactionId).toBe(
        transaction.businessTransactionId,
      );

      const trustRecordAfter = await client.trustRecord(
        transaction.businessTransactionId,
      );
      expect(trustRecordAfter.verifications).toHaveLength(2);
    });

    it("createTransaction() executes via POST /transactions with a 201, identical pipeline to execute()", async () => {
      const transaction = buildTransaction();

      const trustRecord =
        await authenticatedClient().createTransaction(transaction);

      expect(trustRecord.businessTransactionId).toBe(
        transaction.businessTransactionId,
      );
      expect(trustRecord.executions[0]?.decision.outcome).toBe("APPROVED");

      // status/createdAt supplied by the client are always ignored;
      // Parmana assigns RECEIVED and the current server time.
      expect(trustRecord.transaction.status).toBe("RECEIVED");
    });
  });
});
