import type {
  SignatureAlgorithm,
} from "@parmana/shared";

/**
 * One signature over an artifact.
 */
export interface SignatureEntry {
  readonly algorithm: SignatureAlgorithm;

  readonly keyId: string;

  readonly signature: string;
}

/**
 * Collection of signatures over the same
 * canonical artifact.
 */
export interface SignatureBundle {
  readonly signatures:
    readonly SignatureEntry[];
}