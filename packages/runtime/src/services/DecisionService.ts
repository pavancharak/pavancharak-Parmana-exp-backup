import crypto from "crypto";

import {
  PolicyEngine,
} from "@parmana/policy";

import type {
  Policy,
} from "@parmana/policy";

import {
  DecisionOutcome,
} from "@parmana/shared";

import type {
  JsonValue,
} from "@parmana/shared";

export class DecisionService {
  private readonly engine = new PolicyEngine();

  async create(input: {
    intentId: string;
  policy: Policy;
    signals: Record<string, JsonValue>;
    outcome?: DecisionOutcome;
  }) {
    const result = this.engine.evaluate(input.policy, input.signals);

    return {
      decisionId: crypto.randomUUID(),
      intentId: input.intentId,
      policy: input.policy,
      signals: input.signals,
      outcome:
        input.outcome ??
        (result.outcome === "APPROVE"
          ? DecisionOutcome.APPROVED
          : DecisionOutcome.REJECTED),
      reason: result.reason,
      evaluatedAt: new Date(),
    };
  }
}