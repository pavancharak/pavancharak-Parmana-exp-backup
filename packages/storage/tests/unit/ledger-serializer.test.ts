import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { LedgerSerializer } from "../../src/ledger/LedgerSerializer.js";
import type { LedgerEntry } from "../../src/ledger/LedgerEntry.js";

describe("LedgerSerializer", () => {
  it("serializes an entry with keys sorted, independent of insertion order", () => {
    const serializer = new LedgerSerializer();

    const a: LedgerEntry = {
      id: "entry-1",
      timestamp: 1,
      type: "EXECUTION",
      payload: { ok: true },
    };

    const b: LedgerEntry = {
      payload: { ok: true },
      type: "EXECUTION",
      timestamp: 1,
      id: "entry-1",
    };

    expect(serializer.serialize(a)).toBe(serializer.serialize(b));
  });

  it("hash() is the SHA-256 of the serialized entry", () => {
    const serializer = new LedgerSerializer();

    const entry: LedgerEntry = {
      id: "entry-1",
      timestamp: 1,
      type: "EXECUTION",
      payload: { ok: true },
    };

    const expected = createHash("sha256")
      .update(serializer.serialize(entry))
      .digest("hex");

    expect(serializer.hash(entry)).toBe(expected);
  });

  it("produces different hashes when a top-level field changes", () => {
    const serializer = new LedgerSerializer();

    const entry: LedgerEntry = {
      id: "entry-1",
      timestamp: 1,
      type: "EXECUTION",
      payload: { ok: true },
    };

    const other: LedgerEntry = {
      ...entry,
      id: "entry-2",
    };

    expect(serializer.hash(entry)).not.toBe(serializer.hash(other));
  });

  it(
    "does not reflect nested payload changes in the hash " +
      "(JSON.stringify's array replacer only allows top-level " +
      "entry keys through, so payload always serializes as {})",
    () => {
      const serializer = new LedgerSerializer();

      const entry: LedgerEntry = {
        id: "entry-1",
        timestamp: 1,
        type: "EXECUTION",
        payload: { ok: true },
      };

      const tamperedPayload: LedgerEntry = {
        ...entry,
        payload: { ok: false },
      };

      expect(serializer.serialize(entry)).toContain('"payload":{}');
      expect(serializer.hash(entry)).toBe(
        serializer.hash(tamperedPayload),
      );
    },
  );
});

