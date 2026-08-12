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

  /**
   * The set of capabilities (Intent.action values, e.g.
   * "razorpay:refund-create") a Business Transaction authenticated
   * with this key is allowed to invoke. Enforced by the caller-auth
   * layer before execution, the same boundary allowedPrincipalIds is
   * enforced at.
   *
   * Fail-closed default, deliberately the opposite default from
   * allowedPrincipalIds above: an unset or empty allowedCapabilities
   * denies every capability. Unlike principal scope, there is no
   * meaningful "may only act as itself" fallback for capabilities, so
   * an unconfigured key proves identity but is authorized to invoke
   * nothing until explicitly granted.
   *
   * The literal string "*" as an included entry grants every
   * capability — an explicit, auditable opt-in for intentionally
   * unrestricted callers (e.g. internal admin tooling), never an
   * implicit default.
   */
  readonly allowedCapabilities?: readonly string[];
}
