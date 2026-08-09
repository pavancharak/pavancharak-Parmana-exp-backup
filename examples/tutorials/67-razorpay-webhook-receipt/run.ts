import { createHmac } from "node:crypto";

import { verifyRazorpayWebhookSignature } from "../../../packages/api/src/webhooks/verifyRazorpayWebhookSignature.js";
import { InMemoryRazorpayWebhookEventStore } from "../../../packages/api/src/webhooks/InMemoryRazorpayWebhookEventStore.js";
import type { PendingRazorpayWebhookEvent } from "../../../packages/api/src/webhooks/RazorpayWebhookTypes.js";

//
// A Razorpay webhook delivery must clear two independent gates before
// anything downstream trusts it: (1) its HMAC-SHA256 signature over
// the raw body must verify against the shared secret, and (2) its
// eventId must not have been seen before -- Razorpay retries webhook
// deliveries on anything short of a 2xx response, so the same event
// can and does arrive more than once. Order matters: verify first,
// record second (see verifyRazorpayWebhookSignature.ts's own comment)
// -- a forged signature must never be able to burn a legitimate event
// id out of the dedupe store.
//
const WEBHOOK_SECRET = "tutorial-67-webhook-secret";

function sign(rawBody: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

console.log();
console.log("==================================================");
console.log("Tutorial 67 - Razorpay Webhook Receipt");
console.log("==================================================");
console.log();

const eventStore = new InMemoryRazorpayWebhookEventStore();

async function receiveWebhook(
  rawBody: Buffer,
  signatureHeader: string,
  eventId: string,
): Promise<{ accepted: boolean; reason: string }> {
  if (!verifyRazorpayWebhookSignature(rawBody, signatureHeader, WEBHOOK_SECRET)) {
    return { accepted: false, reason: "signature verification failed" };
  }

  // Only reachable once the signature is proven genuine -- the
  // dedupe store is never touched by an unverified delivery.
  const event: PendingRazorpayWebhookEvent = {
    eventId,
    eventType: "refund.processed",
    payload: rawBody.toString("utf8"),
    receivedAt: new Date().toISOString(),
  };

  const fresh = await eventStore.recordIfUnseen(event);
  return {
    accepted: true,
    reason: fresh ? "signature verified; recorded as fresh" : "signature verified; duplicate, not re-recorded",
  };
}

console.log("Scenario 1: Genuine delivery");
console.log("--------------------------------------------------");

const payload1 = Buffer.from(
  JSON.stringify({
    event: "refund.processed",
    payload: { refund: { entity: { id: "rfnd_TUT067A", notes: { parmana_txn: "txn-a" } } } },
  }),
);
const signature1 = sign(payload1, WEBHOOK_SECRET);
const result1 = await receiveWebhook(payload1, signature1, "evt_TUT067_001");
console.log(`Signature valid : ${result1.accepted}`);
console.log();

console.log("Scenario 2: Tampered body (signature no longer matches)");
console.log("--------------------------------------------------");

const payload2Genuine = Buffer.from(
  JSON.stringify({
    event: "refund.processed",
    payload: { refund: { entity: { id: "rfnd_TUT067B", notes: { parmana_txn: "txn-b" } } } },
  }),
);
const signature2 = sign(payload2Genuine, WEBHOOK_SECRET);
// An attacker (or a buggy proxy) alters the body after the signature
// was computed -- amount and refund id are attacker-controlled paths
// in a real payload, so this is exactly the tamper an attacker would
// attempt.
const payload2Tampered = Buffer.from(
  payload2Genuine.toString("utf8").replace("rfnd_TUT067B", "rfnd_TUT067_STOLEN"),
);
const result2 = await receiveWebhook(payload2Tampered, signature2, "evt_TUT067_002");
console.log(`Signature valid (should be false) : ${result2.accepted}`);
console.log(`Reason                            : ${result2.reason}`);
console.log();

console.log("Scenario 3: Duplicate delivery (Razorpay retries on non-2xx)");
console.log("--------------------------------------------------");

const payload3 = Buffer.from(
  JSON.stringify({
    event: "refund.processed",
    payload: { refund: { entity: { id: "rfnd_TUT067C", notes: { parmana_txn: "txn-c" } } } },
  }),
);
const signature3 = sign(payload3, WEBHOOK_SECRET);

if (!verifyRazorpayWebhookSignature(payload3, signature3, WEBHOOK_SECRET)) {
  throw new Error("expected a genuine signature to verify");
}

const firstDelivery = await eventStore.recordIfUnseen({
  eventId: "evt_TUT067_003",
  eventType: "refund.processed",
  payload: payload3.toString("utf8"),
  receivedAt: new Date().toISOString(),
});

// Razorpay redelivers the identical event (same eventId) because, say,
// the server's 2xx response was lost in transit.
const secondDelivery = await eventStore.recordIfUnseen({
  eventId: "evt_TUT067_003",
  eventType: "refund.processed",
  payload: payload3.toString("utf8"),
  receivedAt: new Date().toISOString(),
});

console.log(`First delivery recorded as fresh   : ${firstDelivery}`);
console.log(`Second (duplicate) delivery fresh  : ${secondDelivery}`);
console.log(`Total events durably recorded      : ${(await eventStore.listAll()).length}`);
console.log();

const allPassed =
  result1.accepted === true &&
  result2.accepted === false &&
  firstDelivery === true &&
  secondDelivery === false &&
  (await eventStore.listAll()).length === 2; // scenario 3's event, once -- scenarios 1/2 never reached the store in this script

if (allPassed) {
  console.log("✓ Genuine signatures accepted, tampered ones rejected, duplicates deduped.");
} else {
  console.log("✗ One or more webhook receipt guarantees did not hold.");
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 68 - Razorpay Settlement Confirmation");
