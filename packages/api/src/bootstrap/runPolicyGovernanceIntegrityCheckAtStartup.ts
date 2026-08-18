import { PolicyChangeCrypto } from "@parmana/crypto";

import { policyRepository } from "../application.js";
import { policyChangeApprovalRecordRepository } from "../repositories.js";
import { verifyPolicyGovernanceIntegrityAtStartup } from "../governance/verifyPolicyGovernanceIntegrityAtStartup.js";

function logUnexpectedFailure(error: unknown): void {
  console.error({
    event: "policy_governance_integrity_check_unexpected_failure",
    error: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Kicks off the Policy Governance deploy/startup integrity check
 * (see verifyPolicyGovernanceIntegrityAtStartup.ts) without awaiting
 * it -- deliberately: this check must never delay the server from
 * binding its port and accepting traffic, only run alongside that.
 *
 * The checker function itself never throws once invoked -- but
 * *constructing* its dependencies (`new PolicyChangeCrypto()` below)
 * happens synchronously, as part of building the argument object,
 * before verifyPolicyGovernanceIntegrityAtStartup ever returns a
 * promise for `.catch()` to attach to. A `.catch()` alone does not
 * cover a throw from that construction step. The try/catch below
 * does: it wraps construction and invocation together, so a
 * synchronous throw here (e.g. from a future change to
 * PolicyChangeCrypto's constructor, or a signature-provider /
 * hash-provider registry gap) is logged and swallowed the exact same
 * way as an asynchronous failure inside the check itself -- never
 * propagated, never able to block server startup.
 */
export function runPolicyGovernanceIntegrityCheckAtStartup(): void {
  try {
    verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: new PolicyChangeCrypto(),
      policyChangeApprovalRecordRepository,
    }).catch(logUnexpectedFailure);
  } catch (error) {
    logUnexpectedFailure(error);
  }
}
