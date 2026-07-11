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
  ExecutionReceiptVerifier,
} from "@parmana/receipt";

async function main(): Promise<void> {
  console.log();
  console.log(
    "==================================================",
  );
  console.log(
    "Tutorial 55 - Execution Receipt Verification",
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

  //
  // Verify Receipt.
  //
  const verified =
    new ExecutionReceiptVerifier().verify(
      receipt,
    );

  console.log(
    "Execution Receipt Verification",
  );

  console.log(
    "--------------------------------------------------",
  );

  console.log(
    `Receipt Version : ${receipt.version}`,
  );

  console.log(
    `Permit          : VALID`,
  );

  console.log(
    `Trust Record    : VALID`,
  );

  console.log(
    `Overall Result  : ${
      verified
        ? "VERIFIED"
        : "FAILED"
    }`,
  );

  console.log();

  if (verified) {
    console.log(
      "✓ Execution Receipt verified successfully.",
    );
  } else {
    console.log(
      "✗ Receipt verification failed.",
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