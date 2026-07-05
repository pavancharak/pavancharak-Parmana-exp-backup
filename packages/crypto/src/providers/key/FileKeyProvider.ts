import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import { loadConfig } from "@parmana/shared";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";

import type {
  KeyMetadata,
  KeyProvider,
} from "../../KeyProvider.js";

/**
 * File Key Provider.
 *
 * Loads signing keys from the local filesystem.
 *
 * Layout:
 *
 * keys/
 *   <keyId>.private.pem
 *   <keyId>.public.pem
 *
 * This implementation is intended for development
 * and self-hosted deployments. Production
 * environments can replace it with KMS, HSM, or
 * cloud key vault implementations without changing
 * the crypto layer.
 */
export class FileKeyProvider implements KeyProvider {
  private readonly config = loadConfig();
constructor() {
  console.log(
    "[FileKeyProvider]",
    this.config.keys,
  );
}

private readonly keyDirectory =
  this.config.keys.keyDirectory ?? "./keys";

/**
 * Root directory containing Parmana keys.
 */
private getKeyDirectory(): string {
  if (!existsSync(this.keyDirectory)) {
    throw new Error(
      `Key directory does not exist: ${this.keyDirectory}`,
    );
  }

  return this.keyDirectory;
}

  /**
   * Returns true if the key exists.
   */
  async hasKey(
    keyId: string,
  ): Promise<boolean> {
    return existsSync(this.privateKeyPath(keyId));
  }

  /**
   * Returns key metadata.
   *
   * Future implementations may load this from a
   * manifest or key registry.
   */
  async getMetadata(
    keyId: string,
  ): Promise<KeyMetadata> {
    if (!(await this.hasKey(keyId))) {
      throw new Error(
        `Key not found: ${keyId}`,
      );
    }

    return {
      keyId,
      algorithm:
        this.config.crypto.signatureProvider,
    };
  }

  /**
   * Loads the private key.
   */
  async getPrivateKey(
    keyId: string,
  ): Promise<KeyObject> {
    const path = this.privateKeyPath(keyId);

    if (!existsSync(path)) {
      throw new Error(
        `Private key not found: ${keyId}`,
      );
    }

    return createPrivateKey(
      readFileSync(path),
    );
  }

  /**
   * Loads the public key.
   */
  async getPublicKey(
    keyId: string,
  ): Promise<KeyObject> {
    const path = this.publicKeyPath(keyId);

    if (!existsSync(path)) {
      throw new Error(
        `Public key not found: ${keyId}`,
      );
    }

    return createPublicKey(
      readFileSync(path),
    );
  }

  /**
   * Resolves the private key path.
   */
  private privateKeyPath(
    keyId: string,
  ): string {
    return join(
  this.getKeyDirectory(),
  `${keyId}.private.pem`,
);
  }

  /**
   * Resolves the public key path.
   */
  private publicKeyPath(
    keyId: string,
  ): string {
    return join(
  this.getKeyDirectory(),
  `${keyId}.public.pem`,
);
  }
}