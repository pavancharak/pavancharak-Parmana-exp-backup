import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
} from "@parmana/crypto";

import type { SignedExecutionAuthorization } from "@parmana/shared";

import { EnvelopeVerifier } from "../src/EnvelopeVerifier.js";
import { MemoryNonceStore } from "../src/MemoryNonceStore.js";
import { requireParmanaAuthorization } from "../src/express.js";

const crypto = CryptoBootstrap.create();

function generateKeyPair() {
  return generateKeyPairSync("ed25519");
}

async function signAuthorization(
  privateKey: ReturnType<typeof generateKeyPair>["privateKey"],
  ttlSeconds = 60,
): Promise<SignedExecutionAuthorization> {
  const signer = new AuthorizationSigner(crypto);

  return signer.sign(
    {
      decisionId: "decision-1",
      businessTransactionId: "txn-1",
      policyName: "policy-a",
      policyVersion: "1.0.0",
    },
    privateKey,
    "key-1",
    ttlSeconds,
  );
}

describe("EnvelopeVerifier", () => {
  it("accepts a valid first-use envelope", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const result = await verifier.verify(signed);

    expect(result.valid).toBe(true);
    expect(result.checks.signatureVerified).toBe(true);
    expect(result.checks.notExpired).toBe(true);
    expect(result.checks.ttlWithinPolicy).toBe(true);
    expect(result.checks.nonceUnseen).toBe(true);
  });

  it("rejects a second use of the same nonce", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const nonceStore = new MemoryNonceStore();

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore,
    });

    const first = await verifier.verify(signed);
    expect(first.valid).toBe(true);

    const second = await verifier.verify(signed);

    expect(second.valid).toBe(false);
    expect(second.checks.nonceUnseen).toBe(false);
    expect(second.checks.signatureVerified).toBe(true);
    expect(second.checks.notExpired).toBe(true);
    expect(second.checks.ttlWithinPolicy).toBe(true);
  });

  it("a forged envelope does not burn the nonce", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const tampered: SignedExecutionAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        decisionId: "decision-2",
      },
    };

    const nonceStore = new MemoryNonceStore();

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore,
    });

    const forgedResult = await verifier.verify(tampered);

    expect(forgedResult.valid).toBe(false);
    expect(forgedResult.checks.signatureVerified).toBe(false);
    expect(forgedResult.checks.nonceUnseen).toBe(false);

    const originalResult = await verifier.verify(signed);

    expect(originalResult.valid).toBe(true);
    expect(originalResult.checks.nonceUnseen).toBe(true);
  });

  it("an expired envelope does not burn the nonce", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 60);

    const nonceStore = new MemoryNonceStore();

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore,
    });

    const farFuture = new Date(
      Date.parse(signed.payload.authorizedAt) + 120_000,
    );

    const expiredResult = await verifier.verify(signed, farFuture);

    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.checks.signatureVerified).toBe(true);
    expect(expiredResult.checks.notExpired).toBe(false);
    expect(expiredResult.checks.nonceUnseen).toBe(false);

    const withinValidity = new Date(
      Date.parse(signed.payload.authorizedAt) + 1_000,
    );

    const originalResult = await verifier.verify(signed, withinValidity);

    expect(originalResult.valid).toBe(true);
    expect(originalResult.checks.nonceUnseen).toBe(true);
  });

  it("rejects an envelope whose TTL exceeds maxTtlSeconds", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 3600);

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
      maxTtlSeconds: 300,
    });

    const result = await verifier.verify(signed);

    expect(result.valid).toBe(false);
    expect(result.checks.ttlWithinPolicy).toBe(false);
    expect(result.checks.signatureVerified).toBe(true);
    expect(result.checks.nonceUnseen).toBe(false);
  });

  it("MemoryNonceStore purges expired entries past the size threshold", async () => {
    const nonceStore = new MemoryNonceStore();

    const past = new Date(Date.now() - 1_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();

    // 10,000 already-expired entries.
    for (let i = 0; i < 10_000; i++) {
      await nonceStore.checkAndRecord(`expired-${i}`, past);
    }

    expect(nonceStore.size).toBe(10_000);

    // One more live entry pushes the store past the 10,000
    // threshold, which should trigger a purge on THIS call.
    await nonceStore.checkAndRecord("live-nonce", future);

    // All 10,000 expired entries should have been purged;
    // only the live one remains.
    expect(nonceStore.size).toBe(1);

    // The live nonce is still recorded and still rejects reuse.
    expect(
      await nonceStore.checkAndRecord("live-nonce", future),
    ).toBe(false);
  });
});

describe("requireParmanaAuthorization", () => {
  function createMockResponse() {
    const res = {
      statusCode: undefined as number | undefined,
      body: undefined as unknown,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(body: unknown) {
        res.body = body;
        return res;
      },
    };

    return res;
  }

  it("returns 401 when the authorization is missing", async () => {
    const { publicKey } = generateKeyPair();

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const middleware = requireParmanaAuthorization(verifier);

    const req = { body: {} } as Parameters<typeof middleware>[0];
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(
      req,
      res as unknown as Parameters<typeof middleware>[1],
      next,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "authorization required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 with checks when the authorization is invalid", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const tampered: SignedExecutionAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        decisionId: "tampered",
      },
    };

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const middleware = requireParmanaAuthorization(verifier);

    const req = {
      body: { authorization: tampered },
    } as Parameters<typeof middleware>[0];
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(
      req,
      res as unknown as Parameters<typeof middleware>[1],
      next,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      error: "authorization invalid",
      checks: { signatureVerified: false },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches the result and calls next() when valid", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const middleware = requireParmanaAuthorization(verifier);

    const req = {
      body: { authorization: signed },
    } as Parameters<typeof middleware>[0];
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(
      req,
      res as unknown as Parameters<typeof middleware>[1],
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
    expect(req.parmanaAuthorization?.valid).toBe(true);
  });
});
