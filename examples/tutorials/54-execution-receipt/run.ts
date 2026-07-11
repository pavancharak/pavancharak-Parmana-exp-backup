import {
  CryptoBootstrap,
  FileKeyProvider,
} from "@parmana/crypto";

import {
  ExecutionDecision,
  ExecutionPermitBuilder,
} from "@parmana/execution-control";

import {
  ExecutionTrustRecordBuilder,
} from "@parmana/execution-system";

import {
  ExecutionReceiptBuilder,
} from "@parmana/receipt";

async function main(): Promise<void> {
  console.log();
  console.log(
    "==================================================",
  );
  console.log(
    "Tutorial 54 - Execution Receipt",
  );
  console.log(
    "==================================================",
  );
  console.log();

  //
  // Business artifact.
  //
  const artifact = {
    vendorId: "VENDOR-1001",
    invoiceId: "INV-2026-001",
    paymentAmount: 25000,
    currency: "USD",
  };

  //
  // Hybrid crypto.
  //
  const crypto =
    CryptoBootstrap.createHybrid();

  //
  // Keys.
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
  // Gateway timestamps.
  //
  const timestamp =
    new Date().toISOString();

  const expiresAt =
    new Date(
      Date.now() + 120_000,
    ).toISOString();

  //
  // Build Execution Permit.
  //
  const permit =
    await new ExecutionPermitBuilder(
      crypto,
    ).build(
      artifact,
      ExecutionDecision.ALLOW,
      edPrivateKey,
      pqPrivateKey,
      "default",
      "pq",
      "PERMIT-000001",
      "parmana-gateway",
      "v1",
      timestamp,
      expiresAt,
    );

  //
  // Build Execution Trust Record.
  //
  const trustRecord =
    await new ExecutionTrustRecordBuilder(
      crypto,
    ).build(
      artifact,
      edPrivateKey,
      pqPrivateKey,
      "default",
      "pq",
      "parmana-gateway",
      "v1",
      timestamp,
    );

  //
  // Build Execution Receipt.
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
    `Version        : ${receipt.version}`,
  );

  console.log(
    `Permit ID      : ${receipt.permit.permitId}`,
  );

  console.log(
    `Decision       : ${receipt.permit.decision}`,
  );

  console.log(
    `Gateway        : ${receipt.permit.gatewayId}`,
  );

  console.log(
    `Policy Version : ${receipt.permit.policyVersion}`,
  );

  console.log(
    `Artifact Hash  : ${receipt.trustRecord.artifactHash}`,
  );

  console.log(
    `Timestamp      : ${receipt.trustRecord.timestamp}`,
  );

  console.log();

  console.log(
    "Receipt Signatures",
  );

  console.log(
    "--------------------------------------------------",
  );

  for (const signature of receipt.trustRecord.signatures.signatures) {
    console.log();

    console.log(
      `Algorithm : ${signature.algorithm}`,
    );

    console.log(
      `Key ID    : ${signature.keyId}`,
    );

    console.log(
      `Length    : ${signature.signature.length} characters`,
    );
  }

  console.log();

  console.log(
    "✓ Execution Receipt created successfully.",
  );

  console.log();

  console.log(
    "Tutorial completed successfully.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});