
import { DecisionBuilder } from "./DecisionBuilder.js";
import { ExecutionBuilder } from "./ExecutionBuilder.js";
import { ExecutionGate } from "./ExecutionGate.js";
import { RuntimeAuthorizationSigner } from "./RuntimeAuthorizationSigner.js";

import {
  BusinessTransaction,
  BusinessTransactionStatus,
  ExecutableContent,
  ExecutionTrustRecord,
  JsonValue,
  toExecutableContent,
} from "@parmana/shared";

import {
  PolicyEngine,
  PolicyRouter,
} from "@parmana/policy";

import type { RuntimeContext } from "./context/RuntimeContext.js";
import { RuntimePipeline } from "./RuntimePipeline.js";
import { ExecutionTrustPipeline } from "./ExecutionTrustPipeline.js";

/**
 * Canonical Runtime Engine.
 *
 * Responsibilities:
 * - Load the requested policy.
 * - Evaluate the policy deterministically.
 * - Create the Decision artifact.
 * - Create the initial Execution artifact.
 * - Execute the Runtime Pipeline.
 * - Produce the Execution Trust Record.
 */
export class RuntimeEngine {
  constructor(
  private readonly pipeline: RuntimePipeline,
  private readonly policyRouter: PolicyRouter,
  private readonly policyEngine: PolicyEngine,
  private readonly decisionBuilder: DecisionBuilder,
  private readonly executionGate: ExecutionGate,
  private readonly executionBuilder: ExecutionBuilder,
  private readonly trustPipeline: ExecutionTrustPipeline,
  private readonly authorizationSigner: RuntimeAuthorizationSigner,
  private readonly authorizationTtlSeconds: number,
) {
    if (!pipeline) {
      throw new Error("RuntimePipeline is required.");
    }

    if (!policyRouter) {
      throw new Error("PolicyRouter is required.");
    }

    if (!policyEngine) {
      throw new Error("PolicyEngine is required.");
    }

    if (!trustPipeline) {
      throw new Error("ExecutionTrustPipeline is required.");
    }

    if (!authorizationSigner) {
      throw new Error("RuntimeAuthorizationSigner is required.");
    }
  }

  public async execute(
    transaction: BusinessTransaction,
  ): Promise<{
    transaction: BusinessTransaction;
    context: RuntimeContext;
    trustRecord: ExecutionTrustRecord;
  }> {
    //
    // Runtime signals
    //
    const signals =
      (transaction.signals ?? {}) as Record<
        string,
        JsonValue
      >;

    //
    // Load the exact policy referenced by the transaction.
    //
    const policy = await this.policyRouter.load(
      transaction.policy.name,
      transaction.policy.version,
    );

    //
    // Deterministic policy evaluation.
    //
    const policyDecision =
  this.policyEngine.evaluate(
    policy,
    signals,
  );

const decision =
  this.decisionBuilder.build(
    transaction,
    policyDecision,
  );
    //
    // Initial execution artifact.
    //
    this.executionGate.enforce(
  decision,
);

//
// The exact content that will cross the execution
// boundary, bound into the authorization's
// businessTransactionHash.
//
const executableContent: ExecutableContent =
  toExecutableContent({
    businessTransactionId:
      transaction.businessTransactionId,
    action: transaction.intent.action,
    target: transaction.intent.target,
    parameters: transaction.intent.parameters,
  });

//
// Sign the Execution Authorization.
//
// Reached only when the Decision is APPROVED —
// executionGate.enforce() throws before this
// point for any rejected Decision.
//
const authorization =
  await this.authorizationSigner.sign(
    {
      decisionId: decision.decisionId,
      businessTransactionId:
        transaction.businessTransactionId,
      policyName: transaction.policy.name,
      policyVersion: transaction.policy.version,
      executableContent,
    },
    this.authorizationTtlSeconds,
  );

const execution =
  this.executionBuilder.build(
    transaction,
    decision,
  );

    //
    // Canonical Runtime Context.
    //
    const context: RuntimeContext = {
      transaction: {
        ...transaction,
        status:
          transaction.status ??
          BusinessTransactionStatus.RECEIVED,
      },
      decision,
      authorization,
      execution,
    };

    //
    // Execute runtime pipeline.
    //
    const processedContext =
      await this.pipeline.execute(context);

    //
    // Build Execution Trust Record.
    //
    const trustRecord =
      await this.trustPipeline.execute(
        processedContext,
      );

    return {
      transaction: processedContext.transaction,
      context: processedContext,
      trustRecord,
    };
  }

  /**
   * Returns true if the runtime pipeline is empty.
   */
  public isEmpty(): boolean {
    return this.pipeline.isEmpty();
  }

  /**
   * Returns the number of runtime stages.
   */
  public size(): number {
    return this.pipeline.size();
  }
}