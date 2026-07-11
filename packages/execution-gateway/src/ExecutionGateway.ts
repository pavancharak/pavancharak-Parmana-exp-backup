import type { KeyObject } from "node:crypto";

import { CryptoBootstrap, ExecutableContentHasher } from "@parmana/crypto";

import { EnvelopeVerifier, type NonceStore } from "@parmana/envelope-verifier";

import type { ExecutionControl } from "@parmana/execution-control";

import type {
  ExecutionRequest,
  ExecutionSystem,
} from "@parmana/execution-system";

import {
  toExecutableContent,
  type ExecutableContent,
  type ExecutionResult,
} from "@parmana/shared";

import type { Connector } from "./Connector.js";
import { deepFreeze } from "./deepFreeze.js";
import type { GatewayVerificationResult } from "./GatewayVerificationResult.js";
import type { ExecutionChannel, GatewayIdentityProvider } from "./connector-runtime/types.js";

export interface ExecutionControlOptions {
  /** New package-level control service. */
  readonly service?: ExecutionControl;
  readonly gatewayAuthentication?: unknown;

  /**
   * When present, called once per execute() call with the
   * authorizationId of the request being released, to mint a fresh,
   * request-bound gatewayAuthentication value instead of reusing the
   * static gatewayAuthentication field above. Takes precedence over it
   * when both are supplied.
   */
  readonly mintGatewayAuthentication?: (authorizationId: string) => unknown;

  /** @deprecated Embedded prototype retained for backward compatibility. */
  readonly channel?: ExecutionChannel;
  /** @deprecated Use gatewayAuthentication with service. */
  readonly gatewayIdentity?: GatewayIdentityProvider;

  /** Deterministic deployment routing. It must not inspect credentials. */
  readonly route: (content: Readonly<ExecutableContent>) => string;
}

export interface ExecutionGatewayOptions {
  /**
   * Parmana's public key. Supplied by the caller,
   * exactly as @parmana/envelope-verifier requires —
   * this package never reads key material itself.
   */
  readonly publicKey: KeyObject;

  readonly nonceStore: NonceStore;

  /**
   * The Connector this Gateway is the sole release
   * boundary for.
   */
  readonly connector?: Connector;

  /**
   * Additive controlled-execution mode. When present, verified content is
   * released through an authenticated ExecutionChannel instead of a legacy
   * directly injected Connector.
   */
  readonly executionControl?: ExecutionControlOptions;

  /**
   * Forwarded to the underlying EnvelopeVerifier.
   * Defaults to 300 seconds.
   */
  readonly maxTtlSeconds?: number;
}

/**
 * Execution Gateway.
 *
 * Implements @parmana/execution-system's ExecutionSystem, so
 * it plugs into the existing RuntimeFactory.create() seam
 * exactly like DefaultExecutionSystem or HttpExecutionSystem —
 * no change to RuntimeEngine, RuntimePipeline, or any other
 * core decision-flow component is required.
 *
 * Composes @parmana/envelope-verifier's EnvelopeVerifier
 * rather than reimplementing signature/expiry/TTL/nonce
 * checks, and adds exactly one more side-effect-free check:
 * recomputing the ExecutableContent hash and comparing it to
 * the authorization's businessTransactionHash. This closes the
 * gap where a valid envelope could accompany a modified
 * payload carrying the same businessTransactionId.
 *
 * Verification order (Session 3's ordering rule: side-effect-
 * free checks first, nonce consumed last and only on success):
 *   version -> signature -> expiry -> TTL policy
 *     -> businessTransactionHash recompute-and-compare
 *     -> nonce
 *
 * Stateless and deterministic: there is no pause/resume state.
 * A mismatch is a rejection naming the mismatch; a new
 * authorization is simply a new proposal through the runtime.
 */
export class ExecutionGateway implements ExecutionSystem {
  private readonly envelopeVerifier: EnvelopeVerifier;
  private readonly contentHasher: ExecutableContentHasher;
  private readonly connector: Connector | undefined;
  private readonly executionControl: ExecutionControlOptions | undefined;

  constructor(options: ExecutionGatewayOptions) {
    this.envelopeVerifier = new EnvelopeVerifier({
      publicKey: options.publicKey,
      nonceStore: options.nonceStore,
      ...(options.maxTtlSeconds === undefined
        ? {}
        : { maxTtlSeconds: options.maxTtlSeconds }),
    });

    this.contentHasher = new ExecutableContentHasher(
      CryptoBootstrap.create(),
    );

    if (options.connector === undefined && options.executionControl === undefined) {
      throw new Error("ExecutionGateway requires a connector or executionControl.");
    }
    if (options.connector !== undefined && options.executionControl !== undefined) {
      throw new Error("ExecutionGateway accepts connector or executionControl, not both.");
    }

    this.connector = options.connector;
    this.executionControl = options.executionControl;
  }

  /**
   * Runs the full verification sequence without forwarding to
   * the Connector and without throwing. Exposed so callers
   * (and tests) can inspect the structured result directly.
   */
  async verify(
    request: ExecutionRequest,
    now: Date = new Date(),
  ): Promise<{
    result: GatewayVerificationResult;
    executableContent: ExecutableContent;
  }> {
    const executableContent: ExecutableContent =
      toExecutableContent(request);

    const { passed, checks } =
      await this.envelopeVerifier.verifyChecks(
        request.authorization,
        now,
      );

    let businessTransactionHashMatches = false;
    let hashMismatch: GatewayVerificationResult["hashMismatch"];

    if (passed) {
      const actualHash =
        await this.contentHasher.hash(executableContent);

      const expectedHash =
        request.authorization.payload.businessTransactionHash;

      businessTransactionHashMatches = actualHash === expectedHash;

      if (!businessTransactionHashMatches) {
        hashMismatch = {
          expected: expectedHash,
          actual: actualHash,
        };
      }
    }

    const priorChecksPassed =
      passed && businessTransactionHashMatches;

    //
    // The nonce check is the only check with a side effect,
    // so it runs last and only if every side-effect-free
    // check — including the content hash — passed. A
    // mismatched or forged request must not burn a nonce.
    //
    const nonceUnseen = priorChecksPassed
      ? await this.envelopeVerifier.consumeNonce(
          request.authorization,
        )
      : false;

    const result: GatewayVerificationResult = {
      valid: priorChecksPassed && nonceUnseen,

      checks: {
        ...checks,
        businessTransactionHashMatches,
        nonceUnseen,
      },

      ...(hashMismatch ? { hashMismatch } : {}),
    };

    return { result, executableContent };
  }

  /**
   * Verifies the request, then forwards the verified, frozen
   * content to the Connector. Throws when verification fails —
   * naming every failing check, and both hashes on a content
   * mismatch — so the caller (ExecutionComponent) marks the
   * Execution failed rather than silently dropping it.
   */
  async execute(
    request: ExecutionRequest,
  ): Promise<ExecutionResult> {
    const { result, executableContent } =
      await this.verify(request);

    if (!result.valid) {
      throw new Error(this.describeFailure(result));
    }

    const transaction = deepFreeze(executableContent);

    if (this.executionControl !== undefined) {
      if (this.executionControl.service !== undefined) {
        const gatewayAuthentication =
          this.executionControl.mintGatewayAuthentication !== undefined
            ? this.executionControl.mintGatewayAuthentication(
                request.authorization.payload.authorizationId,
              )
            : this.executionControl.gatewayAuthentication;

        return this.executionControl.service.execute({
          connectorName: this.executionControl.route(transaction),
          authorization: request.authorization,
          executableContent: transaction,
          verifiedTransaction: {
            authorizationVerified: true,
            executableContentVerified: true,
            replayCheckPassed: true,
          },
          executionTimestamp: new Date().toISOString(),
        }, gatewayAuthentication);
      }
      if (this.executionControl.channel === undefined ||
        this.executionControl.gatewayIdentity === undefined) {
        throw new Error("Execution Gateway executionControl is incomplete.");
      }
      return this.executionControl.channel.release({
        executionId: request.authorization.payload.authorizationId,
        connectorId: this.executionControl.route(transaction),
        transaction,
        authorization: request.authorization,
        verification: result,
      }, this.executionControl.gatewayIdentity.present());
    }

    return this.connector!.execute({
      transaction,
      authorization: request.authorization,
      verification: result,
    });
  }

  private describeFailure(
    result: GatewayVerificationResult,
  ): string {
    const failedChecks = Object.entries(result.checks)
      .filter(([, checkPassed]) => !checkPassed)
      .map(([name]) => name);

    const hashDetail = result.hashMismatch
      ? ` businessTransactionHash mismatch: expected ${result.hashMismatch.expected}, got ${result.hashMismatch.actual}.`
      : "";

    return (
      `Execution Gateway rejected request: failed checks ` +
      `[${failedChecks.join(", ")}].${hashDetail}`
    );
  }
}
