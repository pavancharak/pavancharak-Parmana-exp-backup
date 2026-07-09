import {
  ExecutionGateway,
} from "@parmana/execution-gateway";

import type {
  ExecutionSystem,
} from "@parmana/execution-system";

import { createExecutionControl } from "./createExecutionControl.js";
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

  return new ExecutionGateway({
    publicKey,
    nonceStore,

    executionControl: {
      service: executionControl,

      //
      // TODO:
      // Replace with real gateway authentication
      // material.
      //
      gatewayAuthentication: undefined,

      route,
    },
  });
}