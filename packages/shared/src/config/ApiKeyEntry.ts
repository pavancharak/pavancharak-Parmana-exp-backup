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

  /**
   * The set of Authority.principalId / authorization.authorityId
   * values a Business Transaction authenticated with this key is
   * allowed to assert. Enforced by the caller-auth layer before
   * execution: nothing downstream of authentication otherwise
   * checks this, so an unset allowedPrincipalIds must default to
   * "only the callerId itself" — never "anything" — to keep the
   * fail-closed default an unconfigured deployment gets.
   *
   * Optional: omitting it means this key may only assert itself
   * (principalId === callerId) as its authority.
   */
  readonly allowedPrincipalIds?: readonly string[];
}
