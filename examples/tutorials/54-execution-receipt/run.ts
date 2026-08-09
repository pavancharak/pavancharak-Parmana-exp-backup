import { readFileSync } from "node:fs";
import path from "node:path";

import {
  FilePolicyRepository,
} from "@parmana/policy";

import {
  RuntimeFactory,
} from "@parmana/runtime";

import {
  DefaultExecutionSystem,
} from "@parmana/execution-system";

import {
  MemoryBusinessTransactionRepository,
  MemoryExecutionTrustRecordRepository,
} from "@parmana/storage";

import type {
  BusinessTransaction,
} from "@parmana/shared";

//
// Historical note: this tutorial previously combined the dead
// ExecutionPermitBuilder/ExecutionTrustAttestationBuilder/
// ExecutionReceiptBuilder scaffolding (Hybrid Signature Support
// milestone, Phase A: confirmed zero live callers, zero test
// coverage, deleted). It now demonstrates the real Receipt,
// produced by the same production pipeline Tutorial 07 uses --
// with CRYPTO_MODE=hybrid active, so ReceiptCrypto additionally
// signs it with ML-DSA-65 alongside the default Ed25519 signature.
//

process.env.CRYPTO_MODE = "hybrid";
process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";

const root = path.resolve(import.meta.dirname);

const transaction = JSON.parse(
  readFileSync(
    path.join(
      root,
      "../../shared/vendor-payment-transaction.json",
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

const executionSystem =
  new DefaultExecutionSystem();

const application =
  RuntimeFactory.create(
    transactions,
    trustRecords,
    policyRepository,
    executionSystem,
  );

// --------------------------------------------------
// EXECUTION
//
// application.execute() runs the complete pipeline,
// including Receipt generation (ReceiptService, via the
// same ReceiptCrypto used in production) -- not a separate
// call, exactly as Tutorial 07 already shows.
// --------------------------------------------------

const trustRecord =
  await application.execute(
    transaction,
  );

const receipt =
  trustRecord.receipts.at(-1);

if (!receipt) {
  throw new Error(
    "Expected a Receipt to be generated as part of execute().",
  );
}

// --------------------------------------------------
// OUTPUT
// --------------------------------------------------

console.log("========================================");
console.log(" Parmana Tutorial 54 - Execution Receipt");
console.log("========================================");

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

console.log("Legacy signature (unchanged shape, always present)");
console.log(
  `  algorithm : ${receipt.algorithm}`,
);
console.log(
  `  length    : ${receipt.signature.length} characters`,
);

console.log();

console.log(
  `Schema version : ${receipt.schemaVersion ?? "(absent -- legacy single-signature receipt)"}`,
);

console.log();

console.log("Additive hybrid signatures[] (present only under CRYPTO_MODE=hybrid)");

for (const entry of receipt.signatures ?? []) {
  console.log(
    `  ${entry.algorithm.padEnd(10)} keyId=${entry.keyId}`,
  );
}

console.log();

if (
  receipt.schemaVersion === 2 &&
  receipt.signatures?.length === 2
) {
  console.log(
    "✓ Receipt carries both the legacy signature and the additive hybrid signatures[].",
  );
} else {
  console.log(
    "✗ Expected a hybrid-shaped Receipt (schemaVersion 2, two signatures).",
  );
}

console.log();

console.log("Tutorial Complete");
console.log(
  "Next: Tutorial 55 - Execution Receipt Verification",
);
