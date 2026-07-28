import path from "node:path";
import { readFile } from "node:fs/promises";

import type { Policy } from "./types/Policy.js";
import type { PolicyRepository } from "./PolicyRepository.js";

import { PolicyNotFoundError } from "./errors/PolicyNotFoundError.js";

/**
 * name/version become path segments
 * (`<basePath>/<name>/<version>/policy.json`); anything outside this set
 * (path separators, `..`, null bytes, etc.) could otherwise walk out of
 * the configured policy directory. Same pattern and same reasoning as
 * @parmana/crypto's FileKeyProvider.VALID_KEY_ID.
 */
const VALID_NAME_OR_VERSION = /^[A-Za-z0-9._-]+$/;

/**
 * File-based Policy Repository.
 *
 * Layout:
 *
 * policies/
 *   vendor-payment/
 *     1.0.0/
 *       policy.json
 */
export class FilePolicyRepository
  implements PolicyRepository
{
  constructor(
    private readonly basePath: string,
  ) {}

  public async load(
    name: string,
    version: string,
  ): Promise<Policy> {
    if (
      !VALID_NAME_OR_VERSION.test(name) ||
      !VALID_NAME_OR_VERSION.test(version)
    ) {
      throw new PolicyNotFoundError(
        name,
        version,
      );
    }

    const file = path.join(
      this.basePath,
      name,
      version,
      "policy.json",
    );

    try {
      const json = await readFile(
        file,
        "utf8",
      );

      return JSON.parse(json) as Policy;
    } catch {
      throw new PolicyNotFoundError(
        name,
        version,
      );
    }
  }
}