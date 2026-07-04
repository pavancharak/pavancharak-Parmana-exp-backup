import type { CryptoProvider } from "./providers/CryptoProvider.js";
import type { KeyProvider } from "./KeyProvider.js";

/**
 * Complete crypto runtime.
 */
export interface CryptoEnvironment {
  readonly crypto: CryptoProvider;
  readonly keys: KeyProvider;
}