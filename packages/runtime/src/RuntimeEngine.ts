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

import type {
  RuntimeContext,
} from "./context/RuntimeContext.js";

import { RuntimePipeline } from "./RuntimePipeline.js";
import { ExecutionTrustPipeline } from "./ExecutionTrustPipeline.js";

import {
  RuntimeHookRunner,
} from "./hooks/RuntimeHookRunner.js";

import type {
  RuntimeHook,
} from "./hooks/RuntimeHook.js";

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
  private readonly hookRunner: RuntimeHookRunner;

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
    private readonly hooks: RuntimeHook[] = [],
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

    this.hookRunner =
      new RuntimeHookRunner(
        hooks,
      );
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
  // Policy loading
  //

  await this.hookRunner.beforePolicyLoad(
    transaction,
  );

  const policy =
    await this.policyRouter.load(
      transaction.policy.name,
      transaction.policy.version,
    );

  await this.hookRunner.afterPolicyLoad(
    transaction,
    policy,
  );

  //
  // Policy evaluation
  //

  await this.hookRunner.beforePolicyEvaluation(
    transaction,
    policy,
  );

  const policyDecision =
    this.policyEngine.evaluate(
      policy,
      signals,
    );

  await this.hookRunner.afterPolicyEvaluation(
    transaction,
    policy,
    policyDecision,
  );

  //
  // Decision
  //

  await this.hookRunner.beforeDecision(
    transaction,
    policyDecision,
  );

  const decision =
    this.decisionBuilder.build(
      transaction,
      policyDecision,
    );

  //
  // Enforce
  //

  this.executionGate.enforce(
    decision,
  );
    const executableContent: ExecutableContent =
      toExecutableContent({
        businessTransactionId:
          transaction.businessTransactionId,
        action: transaction.intent.action,
        target: transaction.intent.target,
        parameters: transaction.intent.parameters,
      });

   //
// Authorization
//

await this.hookRunner.beforeAuthorization(
  transaction,
  policyDecision,
);

const authorization =
  await this.authorizationSigner.sign(
    {
      decisionId:
        decision.decisionId,
      businessTransactionId:
        transaction.businessTransactionId,
      policyName:
        transaction.policy.name,
      policyVersion:
        transaction.policy.version,
      executableContent,
    },
    this.authorizationTtlSeconds,
  );

await this.hookRunner.afterAuthorization(
  transaction,
  policyDecision,
  authorization,
);

//
// Execution
//

const execution =
  this.executionBuilder.build(
    transaction,
    decision,
  );

//
// Runtime Context
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

await this.hookRunner.afterDecision(
  context,
);

await this.hookRunner.beforeExecution(
  context,
);

try {
  //
  // Runtime Pipeline
  //

  const processedContext =
    await this.pipeline.execute(
      context,
    );

  await this.hookRunner.afterExecution(
    processedContext,
  );

  await this.hookRunner.beforeTrustRecord(
    processedContext,
  );

  //
  // Trust Pipeline
  //

  const trustRecord =
    await this.trustPipeline.execute(
      processedContext,
    );

  await this.hookRunner.afterTrustRecord(
    processedContext,
    trustRecord,
  );

  return {
    transaction:
      processedContext.transaction,
    context:
      processedContext,
    trustRecord,
  };
} catch (error) {
  await this.hookRunner.onRuntimeError(
    context,
    error as Error,
  );

  throw error;
}
 
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