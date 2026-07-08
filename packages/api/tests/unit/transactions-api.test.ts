import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

beforeAll(() => {
  process.env.PARMANA_STORAGE = "supabase";
});

import app from "../../src/app.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { hasSupabaseConfig } from "../helpers/supabase-availability.js";

const supabaseConfigured = hasSupabaseConfig();

if (!supabaseConfigured) {
  console.log(
    "[SKIP] Transactions API (persistence cases): SUPABASE_URL / " +
      "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) not set. " +
      "See packages/api/README.md to enable this suite.",
  );
}

describe("GET /transactions", () => {
  it("returns the list of Business Transactions", async () => {
    const response = await request(app).get("/transactions");

    expect(response.status).toBe(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});

describe("GET /transactions/:id", () => {
  it("returns 404 when the Business Transaction does not exist", async () => {
    const response = await request(app).get("/transactions/txn-001");

    expect(response.status).toBe(404);

    expect(response.body.error).toBe("Business Transaction not found.");
  });
});

describe("POST /transactions", () => {
  it("returns a validation error for an invalid Business Transaction ID", async () => {
    const response = await request(app).post("/transactions").send({
      businessTransactionId: "txn-001",
    });

    expect(response.status).toBe(400);

    expect(response.body.error).toBe(
      "businessTransactionId must be a valid UUID.",
    );
  });

  it.skipIf(!supabaseConfigured)(
    "creates a Business Transaction with a server-set status, ignoring any client-supplied status",
    async () => {
      const transaction = createBusinessTransaction();

      const response = await request(app)
        .post("/transactions")
        .send({
          ...transaction,
          status: "APPROVED",
        });

      expect(response.status).toBe(201);

      expect(response.body.transaction.status).toBe("RECEIVED");

      const stored = await request(app).get(
        `/transactions/${transaction.businessTransactionId}`,
      );

      expect(stored.status).toBe(200);

      expect(stored.body.status).toBe("RECEIVED");
    },
  );

  it.skipIf(!supabaseConfigured)(
    "drops unrecognized top-level fields instead of persisting them",
    async () => {
      const transaction = createBusinessTransaction();

      const response = await request(app)
        .post("/transactions")
        .send({
          ...transaction,
          unexpectedField: "should-not-be-persisted",
        });

      expect(response.status).toBe(201);

      expect(response.body.transaction.unexpectedField).toBeUndefined();

      const stored = await request(app).get(
        `/transactions/${transaction.businessTransactionId}`,
      );

      expect(stored.status).toBe(200);

      expect(stored.body.unexpectedField).toBeUndefined();
    },
  );

  it.skipIf(!supabaseConfigured)(
    "fails with the shared 400 envelope when a trust-chain invariant is violated",
    async () => {
      const transaction = createBusinessTransaction();

      const response = await request(app)
        .post("/transactions")
        .send({
          ...transaction,
          authorization: {
            ...transaction.authorization,
            authorityId: crypto.randomUUID(),
          },
        });

      expect(response.status).toBe(400);

      expect(response.body.error).toBe(
        "authorization.authorityId must match authority.authorityId.",
      );
    },
  );
});


