import {
  CryptoBootstrap,
  FileKeyProvider,
  HybridSigner,
  HybridVerifier,
} from "@parmana/crypto";

async function main(): Promise<void> {
  console.log();
  console.log(
    "==================================================",
  );
  console.log(
    "Tutorial 52 - Hybrid Signatures",
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

  const edPublicKey =
    await keyProvider.getPublicKey(
      "default",
    );

  const pqPrivateKey =
    await keyProvider.getPrivateKey(
      "pq",
    );

  const pqPublicKey =
    await keyProvider.getPublicKey(
      "pq",
    );

  //
  // Sign.
  //
  const signer =
    new HybridSigner(
      crypto,
    );

  const bundle =
    await signer.sign(
      artifact,
      edPrivateKey,
      pqPrivateKey,
      "default",
      "pq",
    );

  //
  // Verify.
  //
  const verifier =
    new HybridVerifier(
      crypto,
    );

  const verified =
    await verifier.verify(
      artifact,
      bundle,
      edPublicKey,
      pqPublicKey,
    );

  console.log(
    "Hybrid Signature Bundle",
  );

  console.log(
    "--------------------------------------------------",
  );

  for (const signature of bundle.signatures) {
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

    console.log(
      `Preview   : ${signature.signature.substring(0, 80)}...`,
    );
  }

  console.log();

  console.log(
    `Verified : ${verified}`,
  );

  console.log();

  if (verified) {
    console.log(
      "✓ Hybrid signature verified.",
    );
  } else {
    console.log(
      "✗ Verification failed.",
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