/**
 * One configured caller credential.
 *
 * Only the SHA-256 hash of the raw key is ever held here,
 * never the key itself. Multiple entries may share the
 * same callerId; that is how key rotation works (add the
 * new hash, keep the old one active during migration,
 * remove the old entry to revoke it).
 */
export interface ApiKeyEntry {
  readonly callerId: string;
  readonly keyHash: string;
}
