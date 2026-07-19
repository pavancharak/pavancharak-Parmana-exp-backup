import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyRazorpayWebhookSignature } from "../../../src/webhooks/verifyRazorpayWebhookSignature.js";

const SECRET = "unit-test-webhook-secret";

function sign(body: Buffer, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyRazorpayWebhookSignature", () => {
  it("accepts a valid signature over a known body (HMAC-SHA256 vector)", () => {
    const body = Buffer.from('{"event":"refund.processed","payload":{"refund":{"entity":{"id":"rfnd_ABC123"}}}}');
    const signature = sign(body);

    expect(verifyRazorpayWebhookSignature(body, signature, SECRET)).toBe(true);
  });

  it("rejects when a single byte of the body is tampered after signing", () => {
    const original = Buffer.from('{"event":"refund.processed","amount":100}');
    const signature = sign(original);

    const tampered = Buffer.from(original);
    tampered[tampered.length - 5] = (tampered[tampered.length - 5] as number) ^ 0x01;

    expect(verifyRazorpayWebhookSignature(tampered, signature, SECRET)).toBe(false);
  });

  it("rejects when a single byte of the signature is tampered", () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const signature = sign(body);

    const tamperedChar = signature[0] === "0" ? "1" : "0";
    const tamperedSignature = tamperedChar + signature.slice(1);

    expect(verifyRazorpayWebhookSignature(body, tamperedSignature, SECRET)).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const body = Buffer.from('{"event":"refund.processed"}');
    const signature = sign(body, "a-different-secret");

    expect(verifyRazorpayWebhookSignature(body, signature, SECRET)).toBe(false);
  });

  it("rejects a non-hex signature header without throwing", () => {
    const body = Buffer.from('{"event":"refund.processed"}');

    expect(() => verifyRazorpayWebhookSignature(body, "not-valid-hex-!!", SECRET)).not.toThrow();
    expect(verifyRazorpayWebhookSignature(body, "not-valid-hex-!!", SECRET)).toBe(false);
  });

  it("verifies over the exact raw bytes, not a re-serialized JSON.stringify of the parsed body", () => {
    // Deliberately pretty-printed with extra whitespace and a key order
    // that JSON.parse -> JSON.stringify would not reproduce byte-for-byte
    // (JSON.stringify with no replacer/space always produces compact,
    // no-whitespace output). If the implementation ever re-serialized
    // the parsed object instead of hashing the original bytes, this
    // signature — computed over the ORIGINAL wire bytes — would fail to
    // verify against a re-serialized comparison.
    const rawWireBytes = Buffer.from(
      '{\n  "event": "refund.processed",\n  "payload": {\n    "refund": {\n      "entity": {\n        "id": "rfnd_ABC123"\n      }\n    }\n  }\n}',
    );

    const reSerialized = Buffer.from(JSON.stringify(JSON.parse(rawWireBytes.toString("utf8"))));
    expect(reSerialized.equals(rawWireBytes)).toBe(false); // sanity check: the two really do differ byte-wise

    const signature = sign(rawWireBytes);

    expect(verifyRazorpayWebhookSignature(rawWireBytes, signature, SECRET)).toBe(true);
    expect(verifyRazorpayWebhookSignature(reSerialized, signature, SECRET)).toBe(false);
  });
});
