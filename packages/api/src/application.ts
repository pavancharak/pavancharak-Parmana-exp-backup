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
} from "./repositories.js";

const config =
  loadConfig();

export const policyRepository =
  new FilePolicyRepository(
    config.policy.directory,
  );

export function createApplication(
  executionSystem: ExecutionSystem,
) {
  return RuntimeFactory.create(
    businessTransactionRepository,
    executionTrustRecordRepository,
    policyRepository,
    executionSystem,
  );
}

