import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

beforeAll(() => {
  process.env.PARMANA_STORAGE = "supabase";
});

import app from "../src/app.js";
import { hasSupabaseConfig } from "./helpers/supabase-availability.js";

const supabaseConfigured = hasSupabaseConfig();

if (!supabaseConfigured) {
  console.log(
    "[SKIP] Receipt Negative Integration: SUPABASE_URL / " +
      "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) not set. " +
      "See packages/api/README.md to enable this suite.",
  );
}

describe.skipIf(!supabaseConfigured)("Receipt Negative Integration", () => {
  it("fails for an unknown Business Transaction", async () => {
    const response = await request(app).post("/receipt").send({
      businessTransactionId: crypto.randomUUID(),
    });

    expect(response.status).toBe(409);

    expect(response.body.error).toContain("Execution Trust Record");
  });

  it("fails when Business Transaction ID is missing", async () => {
    const response = await request(app).post("/receipt").send({});

    expect(response.status).toBe(400);
  });

  it("fails for an invalid Business Transaction ID", async () => {
    const response = await request(app).post("/receipt").send({
      businessTransactionId: "abc",
    });

    expect(response.status).toBe(400);
  });
});
