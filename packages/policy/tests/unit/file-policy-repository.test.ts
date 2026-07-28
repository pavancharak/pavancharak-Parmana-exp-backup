import path from "node:path";
import { describe, expect, it } from "vitest";

import { FilePolicyRepository } from "../../src/FilePolicyRepository.js";
import { PolicyNotFoundError } from "../../src/errors/PolicyNotFoundError.js";

/**
 * Found by adversarial testing: name/version had no input validation
 * before path.join(basePath, name, version, "policy.json"), letting a
 * caller traverse outside the configured policy directory and read
 * (and attempt to evaluate) any file literally named policy.json
 * elsewhere on disk. Same bug class @parmana/crypto's FileKeyProvider
 * was already hardened against (see its own file-key-provider.test.ts)
 * — this mirrors that fix and that test file's structure.
 */
describe("FilePolicyRepository name/version sanitization", () => {
  const basePath = path.resolve(
    import.meta.dirname,
    "../../../../policies",
  );

  it("rejects a path-traversal name that resolves outside basePath", async () => {
    const repository = new FilePolicyRepository(basePath);

    await expect(
      repository.load(
        "../examples/tutorials/01-hello-world",
        ".",
      ),
    ).rejects.toThrow(PolicyNotFoundError);
  });

  it("rejects a path-traversal version", async () => {
    const repository = new FilePolicyRepository(basePath);

    await expect(
      repository.load(
        "vendor-payment",
        "../../../../../../etc",
      ),
    ).rejects.toThrow(PolicyNotFoundError);
  });

  it("never reads a file outside basePath even when the traversal target exists and is valid JSON", async () => {
    const repository = new FilePolicyRepository(basePath);

    // examples/tutorials/01-hello-world/policy.json is real, valid JSON,
    // and sits one level outside basePath — proof this is rejected by
    // name/version shape, not merely because the target happens not to
    // exist (the exact differential the live exploit relied on: a
    // content-dependent error would prove the file was read).
    const error = await repository
      .load("../examples/tutorials/01-hello-world", ".")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PolicyNotFoundError);
  });

  it("accepts the well-formed name/version used by the rest of the suite", async () => {
    const repository = new FilePolicyRepository(basePath);

    const policy = await repository.load("vendor-payment", "2.0.0");

    expect(policy.policyId).toBe("vendor-payment");
  });
});
