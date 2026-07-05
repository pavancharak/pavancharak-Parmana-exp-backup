import { describe, expect, it } from "vitest";

import { ReplayExecutor } from "../src/engine/ReplayExecutor.js";
import { ReplayPipeline } from "../src/engine/ReplayPipeline.js";
import type { ReplayContext } from "../src/types/ReplayContext.js";

describe("ReplayExecutor", () => {
  it("executes a plan, returning its execution ids as the execution order", () => {
    const plan = new ReplayPipeline().buildPlan([
      "exec-1",
      "exec-2",
    ]);

    const context: ReplayContext = {};

    const result = new ReplayExecutor().execute(plan, context);

    expect(result.executionIds).toEqual(["exec-1", "exec-2"]);
    expect(result.executionOrder).toEqual(["exec-1", "exec-2"]);
  });

  it("executes an empty plan without error", () => {
    const plan = new ReplayPipeline().buildPlan([]);

    const result = new ReplayExecutor().execute(plan, {});

    expect(result.executionIds).toEqual([]);
    expect(result.executionOrder).toEqual([]);
  });
});
