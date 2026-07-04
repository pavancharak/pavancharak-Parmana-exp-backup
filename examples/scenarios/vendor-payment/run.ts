import { readFileSync } from "node:fs";
import path from "node:path";

import {
  FilePolicyRepository,
} from "@parmana/policy";

import {
  RuntimeBuilder,
} from "@parmana/runtime";

import {
  MemoryExecutionTrustRecordRepository,
} from "@parmana/storage";

import {
  VerificationBuilder,
  IntegrityStage,
  AuthorityVerificationStage,
  AuthorizationVerificationStage,
  IntentVerificationStage,
  EvidenceVerificationStage,
  SignatureVerificationStage,
} from "@parmana/verification";

import {
  ReceiptBuilder,
} from "@parmana/receipt";

import type {
  BusinessTransaction,
} from "@parmana/shared";

const root = path.resolve(import.meta.dirname);

const transaction = JSON.parse(
  readFileSync(
    path.join(
      root,
      "../../tutorials/03-runtime-execution/transaction.json",
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

const trustRecords =
  new MemoryExecutionTrustRecordRepository();

const runtime =
  new RuntimeBuilder()
    .withPolicyRepository(
      policyRepository,
    )
    .build(trustRecords);

// --------------------------------------------------
// EXECUTION
// --------------------------------------------------

const trustRecord =
  await runtime.execute(transaction);

// --------------------------------------------------
// VERIFICATION
// --------------------------------------------------

const verificationEngine =
  new VerificationBuilder()
    .addStage(new IntegrityStage())
    .addStage(new AuthorityVerificationStage())
    .addStage(new AuthorizationVerificationStage())
    .addStage(new IntentVerificationStage())
    .addStage(new EvidenceVerificationStage())
    .addStage(new SignatureVerificationStage())
    .build();

const verification =
  await verificationEngine.verify(trustRecord);

// --------------------------------------------------
// RECEIPT
// --------------------------------------------------

const receiptEngine =
  new ReceiptBuilder().build();

const receipt =
  receiptEngine.generate({
    trustRecord,
    verification,
  });

// --------------------------------------------------
// OUTPUT
// --------------------------------------------------

console.log("========================================");
console.log(" Vendor Payment Scenario");
console.log("========================================");

console.log();

console.log("Business Transaction");

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

console.log("Receipt");

console.log(
  JSON.stringify(
    receipt,
    null,
    2,
  ),
);

console.log();

console.log("========================================");
console.log(" SCENARIO COMPLETED SUCCESSFULLY");
console.log("========================================");