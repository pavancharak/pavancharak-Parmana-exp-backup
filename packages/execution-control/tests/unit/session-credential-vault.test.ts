import { describe, expect, it } from "vitest";

import {
  InMemoryCredentialVault,
  InMemorySessionCredentialVault,
  type Clock,
  type CredentialVault,
  type ExecutionCredential,
  type IdGenerator,
} from "../../src/index.js";

class CountingCredentialVault implements CredentialVault {
  resolveCount = 0;

  constructor(private readonly inner: InMemoryCredentialVault) {}

  async getCredential(connectorId: string): Promise<ExecutionCredential> {
    this.resolveCount += 1;
    return this.inner.getCredential(connectorId);
  }
}

class ManualClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advanceTo(date: Date): void {
    this.current = date;
  }
}

class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `session-credential-${this.counter}`;
  }
}

function fixture(lifetimeMs = 30_000) {
  const credentials = new InMemoryCredentialVault();
  credentials.setCredential("sap", { value: Object.freeze({ apiKey: "sap-secret" }) });

  const clock = new ManualClock(new Date("2026-01-01T00:00:00Z"));
  const idGenerator = new SequentialIdGenerator();

  const vault = new InMemorySessionCredentialVault({
    credentials,
    clock,
    idGenerator,
    lifetimeMs,
  });

  return { vault, clock, idGenerator };
}

describe("InMemorySessionCredentialVault", () => {
  it("issues a session credential and consumes it exactly once", async () => {
    const { vault } = fixture();

    const session = await vault.issue("sap", "authorization-1");

    expect(session.sessionCredentialId).toBe("session-credential-1");
    expect(session.connectorId).toBe("sap");
    expect(session.authorizationId).toBe("authorization-1");

    const credential = await vault.consume(session.sessionCredentialId);

    expect(credential.value).toEqual({ apiKey: "sap-secret" });
  });

  it("rejects reuse of an already-consumed session credential", async () => {
    const { vault } = fixture();

    const session = await vault.issue("sap", "authorization-1");
    await vault.consume(session.sessionCredentialId);

    await expect(vault.consume(session.sessionCredentialId)).rejects.toThrow(
      "already been used",
    );
  });

  it("rejects a session credential after it has expired", async () => {
    const { vault, clock } = fixture(1_000);

    const session = await vault.issue("sap", "authorization-1");
    clock.advanceTo(new Date("2026-01-01T00:00:01.001Z"));

    await expect(vault.consume(session.sessionCredentialId)).rejects.toThrow(
      "expired",
    );
  });

  it("rejects a session credential after it has been revoked", async () => {
    const { vault } = fixture();

    const session = await vault.issue("sap", "authorization-1");
    await vault.revoke(session.sessionCredentialId);

    await expect(vault.consume(session.sessionCredentialId)).rejects.toThrow(
      "revoked",
    );
  });

  it("resolves the underlying secret only at consume(), never at issue()", async () => {
    const inner = new InMemoryCredentialVault();
    inner.setCredential("sap", { value: Object.freeze({ apiKey: "sap-secret" }) });
    const credentials = new CountingCredentialVault(inner);

    const vault = new InMemorySessionCredentialVault({
      credentials,
      clock: new ManualClock(new Date("2026-01-01T00:00:00Z")),
      idGenerator: new SequentialIdGenerator(),
      lifetimeMs: 30_000,
    });

    const session = await vault.issue("sap", "authorization-1");
    expect(credentials.resolveCount).toBe(1);

    await vault.consume(session.sessionCredentialId);
    expect(credentials.resolveCount).toBe(2);
  });
});
