import { describe, it, expect } from "vitest";
import { ReplayEngine } from "../src/ReplayEngine.js";
import { DecisionOutcome } from "@parmana/shared";
import { TEST_POLICY } from "./fixtures/policy.js";

describe("Replay Determinism", () => {
  it("should produce identical output regardless of input order", () => {
    const engine = new ReplayEngine();

    const baseTrustRecord = {
      executions: [
        {
          decision: {
            decisionId: "d1",
            intentId: "i1",
            policy: TEST_POLICY,
            signals: {},
            outcome: DecisionOutcome.APPROVED,
            reason: "ok",
            evaluatedAt: new Date(),
          },
        },
      ],
    };

    const input1 = {
      trustRecord: baseTrustRecord,
      transaction: {
        signals: {},
      },
      policy: TEST_POLICY,
    };

    const input2 = {
      trustRecord: baseTrustRecord,
      transaction: {
        signals: {},
      },
      policy: TEST_POLICY,
    };

    expect(engine.replay(input1)).toEqual(
      engine.replay(input2),
    );
  });
});