import { PolicyChangeCrypto } from "@parmana/crypto";

import { policyRepository } from "../application.js";
import { policyChangeApprovalRecordRepository } from "../repositories.js";
import { verifyPolicyGovernanceIntegrityAtStartup } from "../governance/verifyPolicyGovernanceIntegrityAtStartup.js";

/**
 * Kicks off the Policy Governance deploy/startup integrity check
 * (see verifyPolicyGovernanceIntegrityAtStartup.ts) without awaiting
 * it -- deliberately: this check must never delay the server from
 * binding its port and accepting traffic, only run alongside that.
 * The checker function itself never throws, but `.catch()` here is
 * defense-in-depth against that invariant ever regressing -- an
 * unhandled rejection at module scope would crash the process, the
 * exact opposite of this check's fail-open design.
 */
export function runPolicyGovernanceIntegrityCheckAtStartup(): void {
  verifyPolicyGovernanceIntegrityAtStartup({
    policyRepository,
    policyChangeCrypto: new PolicyChangeCrypto(),
    policyChangeApprovalRecordRepository,
  }).catch((error: unknown) => {
    console.error({
      event: "policy_governance_integrity_check_unexpected_failure",
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
