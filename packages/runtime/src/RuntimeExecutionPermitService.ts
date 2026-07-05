import {
  CanonicalSerializer,
  CryptoBootstrap,
  DEFAULT_KEY_ID,
  ExecutionPermitSigner,
  FileKeyProvider,
} from "@parmana/crypto";

import type {
  BusinessTransaction,
  SignedExecutionAuthorization,
  SignedExecutionPermit,
} from "@parmana/shared";

/**
 * Runtime Execution Permit Service.
 *
 * Produces a cryptographically signed
 * Execution Permit.
 */
export class RuntimeExecutionPermitService {
  private static readonly KEY_ID =
    DEFAULT_KEY_ID;

  private readonly crypto =
    CryptoBootstrap.create();

  private readonly keys =
    new FileKeyProvider();

  private readonly signer =
    new ExecutionPermitSigner(
      this.crypto,
    );
private readonly serializer =
  new CanonicalSerializer();
  

  /**
   * Create a signed Execution Permit.
   */
  async create(
    transaction: BusinessTransaction,
    authorization: SignedExecutionAuthorization,
  ): Promise<SignedExecutionPermit> {

    //
    // Canonical transaction hash
    //

    const canonical =
  this.serializer.serialize(
    transaction,
  );

    const transactionHash =
  Buffer.from(canonical).toString("base64");

    //
    // Signing key
    //

    const privateKey =
      await this.keys.getPrivateKey(
        RuntimeExecutionPermitService.KEY_ID,
      );

    //
    // Sign permit
    //

    return this.signer.sign(
      {
        authorizationId:
          authorization.payload.authorizationId,

        businessTransactionId:
          transaction.businessTransactionId,

        transactionHash,

        expiresAt:
          authorization.payload.expiresAt,
      },
      privateKey,
      RuntimeExecutionPermitService.KEY_ID,
    );

  }
}