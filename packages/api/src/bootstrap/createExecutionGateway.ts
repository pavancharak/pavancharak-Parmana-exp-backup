import {
  ExecutionGateway,
} from "@parmana/execution-gateway";

import {
  GatewayAttestationSigner,
  RandomIdGenerator,
  SystemClock,
} from "@parmana/execution-control";

import type {
  ExecutionSystem,
} from "@parmana/execution-system";

import { createExecutionControl } from "./createExecutionControl.js";
import { createGatewayIdentity } from "./createGatewayIdentity.js";
import { createGatewayKeyPair } from "./createGatewayKeyPair.js";
import { createGatewayPublicKey } from "./createGatewayPublicKey.js";
import { createNonceStore } from "./createNonceStore.js";
import { createConnectorRoute } from "./createConnectorRoute.js";

/**
 * Constructs the production Execution Gateway.
 */
export function createExecutionGateway(): ExecutionSystem {
  const publicKey =
    createGatewayPublicKey();

  const nonceStore =
    createNonceStore();

  const executionControl =
    createExecutionControl();

  const route =
    createConnectorRoute();

  const gatewayIdentity =
    createGatewayIdentity();

  const { privateKey: gatewayPrivateKey } =
    createGatewayKeyPair();

  const attestationSigner =
    new GatewayAttestationSigner(new SystemClock(), new RandomIdGenerator());

  return new ExecutionGateway({
    publicKey,
    nonceStore,

    executionControl: {
      service: executionControl,

      //
      // Mints a fresh, request-bound attestation per call — see
      // ExecutionControlOptions.mintGatewayAuthentication.
      //
      mintGatewayAuthentication: (authorizationId) =>
        attestationSigner.sign(
          gatewayIdentity.gatewayId,
          authorizationId,
          gatewayPrivateKey,
        ),

      route,
    },
  });
}