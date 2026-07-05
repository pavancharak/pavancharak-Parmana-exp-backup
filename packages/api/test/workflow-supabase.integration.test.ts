import { createBusinessTransaction } from "./fixtures/business-transaction.js";
import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import request from "supertest";

beforeAll(() => {
  process.env.PARMANA_STORAGE =
    "supabase";
});

import app from "../src/app.js";
import { hasSupabaseConfig } from "./helpers/supabase-availability.js";

const supabaseConfigured = hasSupabaseConfig();

if (!supabaseConfigured) {
  console.log(
    "[SKIP] Supabase Workflow Integration: SUPABASE_URL / " +
      "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) not set. " +
      "See packages/api/README.md to enable this suite.",
  );
}

describe.skipIf(!supabaseConfigured)(
  "Supabase Workflow Integration",
  () => {
    it(
      "executes a Business Transaction",
      async () => {
        //
        // Create Transaction
        //
        const transaction =
          createBusinessTransaction();

        //
        // Execute
        //
        const response =
          await request(app)
            .post("/execute")
            .send(transaction);

        console.log(
          "EXECUTE:",
          response.status,
        );

        console.log(
          response.body,
        );

        expect(
          response.status,
        ).toBe(200);

        const trustRecord =
          response.body;

        //
        // Verify
        //
        const verifyResponse =
          await request(app)
            .post("/verify")
            .send({
              businessTransactionId:
                trustRecord.businessTransactionId,
            });

        console.log(
          "VERIFY:",
          verifyResponse.status,
        );

        console.log(
          verifyResponse.body,
        );

        expect(
          verifyResponse.status,
        ).toBe(200);

        //
        // Receipt
        //
        const receiptResponse =
          await request(app)
            .post("/receipt")
            .send({
              businessTransactionId:
                trustRecord.businessTransactionId,
            });

        console.log(
          "RECEIPT:",
          receiptResponse.status,
        );

        console.log(
          receiptResponse.body,
        );

        expect(
          receiptResponse.status,
        ).toBe(200);
      },
      30000,
    );
  },
);