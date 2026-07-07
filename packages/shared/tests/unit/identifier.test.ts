import { describe, expect, it } from "vitest";

import { Identifier } from "../../src/common/Identifier.js";

class TestId extends Identifier {
  constructor(value: string) {
    super(value);
  }
}

describe("Identifier", () => {
  it("stores the trimmed string value", () => {
    expect(new TestId("  abc-123  ").value).toBe("abc-123");
  });

  it("throws when constructed with an empty string", () => {
    expect(() => new TestId("")).toThrow("Identifier cannot be empty.");
    expect(() => new TestId("   ")).toThrow(
      "Identifier cannot be empty.",
    );
  });

  it("throws when constructed with a non-string value", () => {
    expect(() => new TestId(123 as unknown as string)).toThrow(TypeError);
  });

  it("equals() compares by value", () => {
    expect(new TestId("abc").equals(new TestId("abc"))).toBe(true);
    expect(new TestId("abc").equals(new TestId("xyz"))).toBe(false);
  });

  it("toString() and toJSON() return the identifier value", () => {
    const id = new TestId("abc");

    expect(id.toString()).toBe("abc");
    expect(id.toJSON()).toBe("abc");
    expect(JSON.stringify({ id })).toBe('{"id":"abc"}');
  });

  it("is immutable", () => {
    const id = new TestId("abc");

    expect(() => {
      (id as { value: string }).value = "changed";
    }).toThrow();
  });
});

