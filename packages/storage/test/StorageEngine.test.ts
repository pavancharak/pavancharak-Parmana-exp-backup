import { describe, expect, it } from "vitest";

import { StorageEngine } from "../src/StorageEngine.js";
import type { LedgerEntry } from "../src/ledger/LedgerEntry.js";

function entry(id: string, type: string): LedgerEntry {
  return { id, timestamp: Date.now(), type, payload: {} };
}

describe("StorageEngine", () => {
  it("records execution, verification, and crypto-proof entries into one shared ledger", () => {
    const engine = new StorageEngine();

    engine.recordExecution(entry("exec-1", "EXECUTION"));
    engine.recordVerification(entry("verify-1", "VERIFICATION"));
    engine.recordCryptoProof(entry("proof-1", "CRYPTO_PROOF"));

    expect(engine.getLedger()).toHaveLength(3);
    expect(engine.getLedger().map((e) => e.id)).toEqual([
      "exec-1",
      "verify-1",
      "proof-1",
    ]);
  });

  it("tracks the last entry independently per record type", () => {
    const engine = new StorageEngine();

    engine.recordExecution(entry("exec-1", "EXECUTION"));
    engine.recordExecution(entry("exec-2", "EXECUTION"));
    engine.recordVerification(entry("verify-1", "VERIFICATION"));

    expect(engine.lastExecution()?.id).toBe("exec-2");
    expect(engine.lastVerification()?.id).toBe("verify-1");
    expect(engine.lastCryptoProof()).toBeNull();
  });

  it("reports integrity as true for a freshly recorded ledger", () => {
    const engine = new StorageEngine();

    engine.recordExecution(entry("exec-1", "EXECUTION"));

    expect(engine.verifyIntegrity()).toBe(true);
  });
});
