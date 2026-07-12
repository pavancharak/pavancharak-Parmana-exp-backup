import "dotenv/config";

import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);

function argument(name: string): string {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
    throw new Error(`Missing argument: ${name}`);
  }

  return args[index + 1];
}

const callerId = argument("--caller-id");

const rawKey = randomBytes(32).toString("base64url");

const keyHash = createHash("sha256").update(rawKey, "utf8").digest("hex");

console.log();
console.log("API key generated");
console.log("--------------------------------");
console.log("Caller ID :", callerId);
console.log("Key       :", rawKey);
console.log("Key hash  :", keyHash);
console.log();
console.log(
  "Give the key above to the caller now. It is not written to disk by",
);
console.log(
  "this script and cannot be recovered once this terminal is closed.",
);
console.log("Only the hash below is ever persisted.");
console.log();
console.log("Add this entry to PARMANA_API_KEYS (a JSON array):");
console.log(JSON.stringify({ callerId, keyHash }));
console.log();
