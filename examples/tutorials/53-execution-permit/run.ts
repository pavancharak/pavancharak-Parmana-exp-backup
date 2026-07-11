import {
  CryptoBootstrap,
  FileKeyProvider,
} from "@parmana/crypto";

import {
  ExecutionDecision,
  ExecutionPermitBuilder,
} from "@parmana/execution-control";

async function main(): Promise<void> {
  console.log();
  console.log(
    "==================================================",
  );
  console.log(
    "Tutorial 53 - Execution Permit",
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
  // Hybrid crypto configuration.
  //
  const crypto =
    CryptoBootstrap.createHybrid();

  //
  // Load signing keys.
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
  // Gateway issues timestamps.
  //
  const issuedAt =
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
    `Permit ID      : ${permit.permitId}`,
  );

  console.log(
    `Decision       : ${permit.decision}`,
  );

  console.log(
    `Gateway        : ${permit.gatewayId}`,
  );

  console.log(
    `Policy Version : ${permit.policyVersion}`,
  );

  console.log(
    `Issued At      : ${permit.issuedAt}`,
  );

  console.log(
    `Expires At     : ${permit.expiresAt}`,
  );

  console.log();

  console.log(
    "Signatures",
  );

  console.log(
    "--------------------------------------------------",
  );

  for (const signature of permit.signatures.signatures) {
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
    "✓ Execution Permit created successfully.",
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