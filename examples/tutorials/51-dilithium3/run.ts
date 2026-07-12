import {
  ArtifactSigner,
  CryptoBootstrap,
  FileKeyProvider,
  SignatureVerifier,
} from "@parmana/crypto";

async function main(): Promise<void> {
  console.log();
  console.log(
    "==================================================",
  );
  console.log(
    "Tutorial 51 - Dilithium3 Signatures",
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
  // Crypto configuration.
  //
  // This tutorial signs with the "pq" key, which is
  // ml-dsa-65 (Dilithium3) key material. CryptoBootstrap.create()
  // builds its provider from PRIMARY_SIGNATURE_PROVIDER, which
  // defaults to ed25519, so it must be overridden here to match
  // the key this tutorial actually loads below.
  //
  process.env.PRIMARY_SIGNATURE_PROVIDER = "dilithium3";

  const crypto =
    CryptoBootstrap.create();

  //
  // Load signing keys.
  //
  const keyProvider =
    new FileKeyProvider();

  const metadata =
  await keyProvider.getMetadata(
    "pq",
  );

const privateKey =
  await keyProvider.getPrivateKey(
    "pq",
  );

const publicKey =
  await keyProvider.getPublicKey(
    "pq",
  );

  console.log(
    `Algorithm : ${metadata.algorithm}`,
  );

  console.log(
    `Key ID    : ${metadata.keyId}`,
  );

  console.log();

  //
  // Sign.
  //
  const signer =
    new ArtifactSigner(
      crypto,
    );

  const signature =
    await signer.sign(
      artifact,
      privateKey,
    );

  //
  // Verify.
  //
  const verifier =
    new SignatureVerifier(
      crypto,
    );

  const verified =
    await verifier.verify(
      artifact,
      signature,
      publicKey,
    );

  console.log();

  console.log(
    "Dilithium3 Verification",
  );

  console.log(
    "--------------------------------------------------",
  );

console.log(
  `Signature Length : ${signature.length} characters`,
);

console.log(
  `Signature Preview : ${signature.substring(0, 80)}...`,
);
  console.log(
    `Verified : ${verified}`,
  );

  console.log();

  if (verified) {
    console.log(
      "✓ Dilithium3 signature verified.",
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