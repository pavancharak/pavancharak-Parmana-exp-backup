import {
  CryptoBootstrap,
  FileKeyProvider,
} from "@parmana/crypto";

import {
  ExecutionDecision,
  ExecutionPermitBuilder,
} from "@parmana/execution-control";

import {
  ExecutionTrustAttestationBuilder,
} from "@parmana/execution-system";

import {
  ExecutionReceiptBuilder,
  ExecutionReceiptVerifier,
} from "@parmana/receipt";

async function main(): Promise<void> {
  console.log();
  console.log(
    "==================================================",
  );
  console.log(
    "Tutorial 56 - Complete Execution Flow",
  );
  console.log(
    "==================================================",
  );
  console.log();

  //
  // Business Artifact
  //
  const artifact = {
    vendorId: "VENDOR-1001",
    invoiceId: "INV-2026-001",
    paymentAmount: 25000,
    currency: "USD",
  };

  console.log(
    "Business Artifact",
  );

  console.log(
    "--------------------------------------------------",
  );

  console.log(
    `Vendor      : ${artifact.vendorId}`,
  );

  console.log(
    `Invoice     : ${artifact.invoiceId}`,
  );

  console.log(
    `Amount      : ${artifact.paymentAmount} ${artifact.currency}`,
  );

  console.log();

  //
  // Policy Evaluation
  //
  const decision =
    ExecutionDecision.ALLOW;

  console.log(
    "Policy Evaluation",
  );

  console.log(
    "--------------------------------------------------",
  );

  console.log(
    `Decision : ${decision}`,
  );

  console.log();

  //
  // Crypto
  //
  const crypto =
    CryptoBootstrap.createHybrid();

  //
  // Keys
  //
  const keyProvider =
    new FileKeyProvider();

  const edPrivateKey =
    await keyProvider.getPrivateKey(
      "default",
    );

  const pqPrivateKey =
    await keyProvider.getPrivateKey(
      "pq",
    );

  //
  // Gateway timestamps
  //
  const issuedAt =
    new Date().toISOString();

  const expiresAt =
    new Date(
      Date.now() + 120_000,
    ).toISOString();

  //
  // Execution Permit
  //
  const permit =
    await new ExecutionPermitBuilder(
      crypto,
    ).build(
      artifact,
      decision,
      edPrivateKey,
      pqPrivateKey,
      "default",
      "pq",
      "PERMIT-000001",
      "parmana-gateway",
      "v1",
      issuedAt,
      expiresAt,
    );

  console.log(
    "Execution Permit",
  );

  console.log(
    "--------------------------------------------------",
  );

  console.log(
    "Created",
  );

  console.log();

  //
  // Execution Trust Record
  //
  const trustRecord =
    await new ExecutionTrustAttestationBuilder(
      crypto,
    ).build(
      artifact,
      edPrivateKey,
      pqPrivateKey,
      "default",
      "pq",
      "parmana-gateway",
      "v1",
      issuedAt,
    );

  console.log(
    "Execution Trust Record",
  );

  console.log(
    "--------------------------------------------------",
  );

  console.log(
    "Created",
  );

  console.log();

  //
  // Execution Receipt
  //
  const receipt =
    new ExecutionReceiptBuilder().build(
      permit,
      trustRecord,
    );

  console.log(
    "Execution Receipt",
  );

  console.log(
    "--------------------------------------------------",
  );

  console.log(
    "Created",
  );

  console.log();

  //
  // Receipt Verification
  //
  const verified =
    new ExecutionReceiptVerifier().verify(
      receipt,
    );

  console.log(
    "Receipt Verification",
  );

  console.log(
    "--------------------------------------------------",
  );

  console.log(
    `Result : ${
      verified
        ? "VERIFIED"
        : "FAILED"
    }`,
  );

  console.log();

  //
  // Final Trust Decision
  //
  console.log(
    "Execution Trust",
  );

  console.log(
    "--------------------------------------------------",
  );

  if (verified) {
    console.log(
      "✓ Enterprise action is authorized.",
    );
  } else {
    console.log(
      "✗ Enterprise action cannot be trusted.",
    );
  }

  console.log();

  console.log(
    "Tutorial completed successfully.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});