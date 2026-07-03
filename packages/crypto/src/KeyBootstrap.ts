import type { KeyProvider } from "./KeyProvider.js";

import { FileKeyProvider } from "./providers/key/FileKeyProvider.js";

/**
 * Key Bootstrap.
 *
 * Composition root for key management.
 */
export class KeyBootstrap {
  private static provider: KeyProvider;

  static create(): KeyProvider {
    if (!this.provider) {
      this.provider = new FileKeyProvider();
    }

    return this.provider;
  }
}