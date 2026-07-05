import { readFileSync } from "node:fs";
import path from "node:path";

import {
  FilePolicyRepository,
} from "@parmana/policy";

import {
  RuntimeFactory,
} from "@parmana/runtime";

import {
  MemoryBusinessTransactionRepository,
  MemoryExecutionTrustRecordRepository,
} from "@parmana/storage";

import type {
  BusinessTransaction,
} from "@parmana/shared";

const root = path.resolve(import.meta.dirname);

const transaction = JSON.parse(
  readFileSync(
    path.join(
      root,
      "../03-runtime-execution/transaction.json",
    ),
    "utf8",
  ),
) as BusinessTransaction;

const policyRepository =
  new FilePolicyRepository(
    path.resolve(
      root,
      "../../../policies",
    ),
  );

const transactions =
  new MemoryBusinessTransactionRepository();

const trustRecords =
  new MemoryExecutionTrustRecordRepository();

const application =
  RuntimeFactory.create(
    transactions,
    trustRecords,
    policyRepository,
  );

//
// application.execute() runs the live Execution
// Trust pipeline end to end, including the live
// VerificationService (hash + signature +
// authorization-binding checks) — the same code
// path used by POST /execute and POST /verify.
//
const trustRecord =
  await application.execute(
    transaction,
  );

//
// Verification already ran as part of execute().
// Calling verify() again demonstrates the same
// live path used by POST /verify.
//
const verification =
  await application.verify(
    transaction.businessTransactionId,
  );

console.log("========================================");
console.log(" Parmana Tutorial 05 - Verification");
console.log("========================================");

console.log();

console.log("Execution Trust Record");

console.log(
  JSON.stringify(
    trustRecord,
    null,
    2,
  ),
);

console.log();

console.log("Verification");

console.log(
  JSON.stringify(
    verification,
    null,
    2,
  ),
);

console.log();

console.log("Tutorial Complete");
console.log(
  "Next: Tutorial 06 - Replay",
);
