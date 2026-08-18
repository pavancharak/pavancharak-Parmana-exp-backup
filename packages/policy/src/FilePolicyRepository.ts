import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";

import type { Policy } from "./types/Policy.js";
import type { PolicyRepository } from "./PolicyRepository.js";

import { PolicyNotFoundError } from "./errors/PolicyNotFoundError.js";
import { PolicyWriteRejectedError } from "./errors/PolicyWriteRejectedError.js";

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

  /**
   * Writes `content` to `<basePath>/<name>/<version>/policy.json`,
   * creating the version directory if needed. Writes to a sibling
   * temp file first and renames it into place -- rename is atomic on
   * the same filesystem, so a reader never observes a partially
   * written file, and a crash mid-write leaves the previous content
   * (or none) intact rather than a corrupt policy.json.
   */
  public async save(
    name: string,
    version: string,
    content: Policy,
  ): Promise<void> {
    if (
      !VALID_NAME_OR_VERSION.test(name) ||
      !VALID_NAME_OR_VERSION.test(version)
    ) {
      throw new PolicyWriteRejectedError(
        name,
        version,
      );
    }

    const directory = path.join(
      this.basePath,
      name,
      version,
    );

    const file = path.join(
      directory,
      "policy.json",
    );

    await mkdir(directory, { recursive: true });

    const tempFile = path.join(
      directory,
      `.policy.json.${crypto.randomUUID()}.tmp`,
    );

    try {
      await writeFile(
        tempFile,
        JSON.stringify(content, null, 2),
        "utf8",
      );

      await rename(tempFile, file);
    } catch (error) {
      await unlink(tempFile).catch(() => {});

      throw error;
    }
  }
}