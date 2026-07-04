import type { KeyObject } from "node:crypto";

import type { SignatureAlgorithm } from "@parmana/shared";

/**
 * Signing key metadata.
 */
export interface KeyMetadata {
  readonly keyId: string;

  readonly algorithm: SignatureAlgorithm;
}

/**
 * Key management abstraction.
 */
export interface KeyProvider {
  /**
   * Returns metadata for the specified key.
   */
  getMetadata(
    keyId: string,
  ): Promise<KeyMetadata>;

  /**
   * Returns the private key.
   */
  getPrivateKey(
    keyId: string,
  ): Promise<KeyObject>;

  /**
   * Returns the public key.
   */
  getPublicKey(
    keyId: string,
  ): Promise<KeyObject>;

  /**
   * Returns true if the key exists.
   */
  hasKey(
    keyId: string,
  ): Promise<boolean>;
}