import path from "node:path";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(
    process.cwd(),
    "../../.env",
  ),
});

import {
  loadConfig,
} from "@parmana/shared";

import {
  CompositeSignalStateVerifier,
  FilePolicyRepository,
} from "@parmana/policy";

import {
  RuntimeFactory,
} from "@parmana/runtime";

import type {
  ExecutionSystem,
} from "@parmana/execution-system";

import {
  businessTransactionRepository,
  executionTrustRecordRepository,
  refusalRecordRepository,
} from "./repositories.js";

import { createHubSpotSignalStateVerifier } from "./bootstrap/createHubSpotSignalStateVerifier.js";

const config =
  loadConfig();

export const policyRepository =
  new FilePolicyRepository(
    config.policy.directory,
  );

export function createApplication(
  executionSystem: ExecutionSystem,
) {
  const signalStateVerifier =
    new CompositeSignalStateVerifier([
      createHubSpotSignalStateVerifier(executionSystem),
    ]);

  return RuntimeFactory.create(
    businessTransactionRepository,
    executionTrustRecordRepository,
    policyRepository,
    executionSystem,
    refusalRecordRepository,
    signalStateVerifier,
  );
}

