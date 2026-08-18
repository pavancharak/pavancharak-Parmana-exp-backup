import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilePolicyRepository } from "@parmana/policy";
import { PolicyChangeCrypto } from "@parmana/crypto";
import type { PolicyChangeApprovalRecord } from "@parmana/shared";
import { MemoryPolicyChangeApprovalRecordRepository } from "@parmana/storage";

import { verifyPolicyGovernanceIntegrityAtStartup } from "../../src/governance/verifyPolicyGovernanceIntegrityAtStartup.js";

function fixtureRecord(
  overrides: Partial<PolicyChangeApprovalRecord> = {},
): PolicyChangeApprovalRecord {
  return {
    policyChangeApprovalRecordId: `pcar-${Math.random()}`,
    pendingPolicyChangeId: "ppc-1",
    policyName: "vendor-payment",
    policyVersion: "1.0.0",
    proposedBy: "human-maker",
    approvedBy: "human-checker",
    proposedAt: new Date("2026-08-01T00:00:00.000Z"),
    approvedAt: new Date("2026-08-01T00:05:00.000Z"),
    contentHashAfter: "sha256-placeholder",
    signature: {
      algorithm: "ed25519",
      keyId: "default",
      value: "placeholder-not-verified-by-this-check",
      signedAt: new Date("2026-08-01T00:05:00.000Z"),
    },
    ...overrides,
  };
}

describe("verifyPolicyGovernanceIntegrityAtStartup", () => {
  let scratchDir: string;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scratchDir = mkdtempSync(
      path.join(tmpdir(), "parmana-governance-integrity-"),
    );
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(scratchDir, { recursive: true, force: true });
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  it("reports nothing to check when there are no approval records", async () => {
    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository: new FilePolicyRepository(scratchDir),
      policyChangeCrypto: new PolicyChangeCrypto(),
      policyChangeApprovalRecordRepository:
        new MemoryPolicyChangeApprovalRecordRepository(),
    });

    expect(result).toEqual({ checked: 0, mismatches: [] });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("passes when the live file matches the most recent approval record's contentHashAfter", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    const content = {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };

    await policyRepository.save("vendor-payment", "1.0.0", content as never);
    const contentHashAfter = await crypto.hashPolicyContent(content);

    await approvalRepository.create(fixtureRecord({ contentHashAfter }));

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    expect(result).toEqual({ checked: 1, mismatches: [] });
    expect(
      consoleLog.mock.calls.some(
        ([entry]) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { event?: unknown }).event ===
            "policy_governance_integrity_check_passed",
      ),
    ).toBe(true);
  });

  it("flags a content-mismatch when the live file was edited outside the pending-change API", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    const approvedContent = {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };

    const contentHashAfter = await crypto.hashPolicyContent(approvedContent);
    await approvalRepository.create(fixtureRecord({ contentHashAfter }));

    // The live file on disk was hand-edited after approval, never
    // going back through the pending-change API.
    const tamperedContent = { ...approvedContent, rules: [{ tampered: true }] };
    await policyRepository.save("vendor-payment", "1.0.0", tamperedContent as never);

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    expect(result).toEqual({
      checked: 1,
      mismatches: [
        {
          policyName: "vendor-payment",
          policyVersion: "1.0.0",
          reason: "content-mismatch",
        },
      ],
    });

    expect(
      consoleError.mock.calls.some(
        ([entry]) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { event?: unknown }).event ===
            "policy_governance_integrity_mismatch",
      ),
    ).toBe(true);
  });

  it("flags 'missing' when an approved version has no live file at all", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    await approvalRepository.create(
      fixtureRecord({ policyName: "never-written", policyVersion: "1.0.0" }),
    );

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    expect(result).toEqual({
      checked: 1,
      mismatches: [
        {
          policyName: "never-written",
          policyVersion: "1.0.0",
          reason: "missing",
        },
      ],
    });
  });

  it("checks a re-approved version exactly once, against the MOST RECENT record", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    const firstContent = {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [{ id: "v1" }],
    };
    const secondContent = {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [{ id: "v2" }],
    };

    // An older approval record for the same (name, version), an
    // in-place patch superseded by the second approval below.
    await approvalRepository.create(
      fixtureRecord({
        policyChangeApprovalRecordId: "pcar-old",
        approvedAt: new Date("2026-08-01T00:00:00.000Z"),
        contentHashAfter: await crypto.hashPolicyContent(firstContent),
      }),
    );

    await approvalRepository.create(
      fixtureRecord({
        policyChangeApprovalRecordId: "pcar-new",
        approvedAt: new Date("2026-08-02T00:00:00.000Z"),
        contentHashAfter: await crypto.hashPolicyContent(secondContent),
      }),
    );

    // The live file matches the SECOND (most recent) approval only.
    await policyRepository.save("vendor-payment", "1.0.0", secondContent as never);

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    // Exactly one (policyName, policyVersion) pair, checked once, and
    // it passes because the check correctly used the most recent
    // record's contentHashAfter, not the older superseded one.
    expect(result).toEqual({ checked: 1, mismatches: [] });
  });

  it("never throws, and logs rather than crashes, when the repository itself is unavailable", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();

    const brokenRepository = {
      create: async () => {
        throw new Error("not used");
      },
      findById: async () => null,
      list: async () => {
        throw new Error("storage unavailable");
      },
      findMostRecentFor: async () => null,
    };

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: brokenRepository,
    });

    expect(result).toEqual({ checked: 0, mismatches: [] });
    expect(
      consoleError.mock.calls.some(
        ([entry]) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { event?: unknown }).event ===
            "policy_governance_integrity_check_unavailable",
      ),
    ).toBe(true);
  });

  it("checking multiple distinct pairs isolates a failure in one from the rest", async () => {
    const policyRepository = new FilePolicyRepository(scratchDir);
    const crypto = new PolicyChangeCrypto();
    const approvalRepository = new MemoryPolicyChangeApprovalRecordRepository();

    const goodContent = {
      policyId: "policy-a",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    };

    await policyRepository.save("policy-a", "1.0.0", goodContent as never);
    await approvalRepository.create(
      fixtureRecord({
        policyName: "policy-a",
        policyVersion: "1.0.0",
        contentHashAfter: await crypto.hashPolicyContent(goodContent),
      }),
    );

    // policy-b has an approval record but was never written -- a
    // "missing" mismatch that must not stop policy-a from being
    // correctly reported as passing.
    await approvalRepository.create(
      fixtureRecord({ policyName: "policy-b", policyVersion: "1.0.0" }),
    );

    const result = await verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: crypto,
      policyChangeApprovalRecordRepository: approvalRepository,
    });

    expect(result.checked).toBe(2);
    expect(result.mismatches).toEqual([
      { policyName: "policy-b", policyVersion: "1.0.0", reason: "missing" },
    ]);
  });
});
