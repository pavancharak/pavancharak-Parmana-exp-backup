import type { Policy } from "./types/Policy.js";

export interface PolicyRepository {
  load(
    name: string,
    version: string,
  ): Promise<Policy>;

  /**
   * Writes `content` as the live policy.json for (name, version),
   * creating the version directory if it does not already exist and
   * overwriting whatever was there if it does. Implementations MUST
   * apply the same name/version path-safety guard as load() -- see
   * FilePolicyRepository's own VALID_NAME_OR_VERSION check -- since
   * unlike load(), a rejected write here is a prevented arbitrary
   * file write, not merely a prevented arbitrary file read.
   */
  save(
    name: string,
    version: string,
    content: Policy,
  ): Promise<void>;
}