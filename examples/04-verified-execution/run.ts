import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import path from "node:path";

import express from "express";

import { FileKeyProvider } from "@parmana/crypto";

import {
  EnvelopeVerifier,
  MemoryNonceStore,
} from "@parmana/envelope-verifier";
import { requireParmanaAuthorization } from "@parmana/envelope-verifier/express";

import { FilePolicyRepository } from "@parmana/policy";

import {
  MemoryBusinessTransactionRepository,
  MemoryExecutionTrustRecordRepository,
} from "@parmana/storage";

import { RuntimeFactory } from "@parmana/runtime";

import type {
  ExecutionRequest,
  ExecutionSystem,
} from "@parmana/execution-system";

import type {
  BusinessTransaction,
  ExecutionResult,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import { print, printHeading } from "../shared/helpers/print.js";

//
// To run this example under the post-quantum provider instead of
// the default (ed25519). Run these from the repository root:
//
//   1. Node >= 24 is required (native node:crypto ml-dsa-65 support).
//   2. Regenerate keys for dilithium3 (do not reuse ed25519 keys —
//      --force overwrites default.private.pem/default.public.pem):
//        node ./node_modules/tsx/dist/cli.mjs \
//          packages/crypto/scripts/generate-keypair.ts \
//          --algorithm dilithium3 --force
//   3. Run with the provider overridden:
//        SIGNATURE_PROVIDER=dilithium3 node ./node_modules/tsx/dist/cli.mjs \
//          examples/04-verified-execution/run.ts
//
// No code in this file changes — selection is entirely through
// SIGNATURE_PROVIDER and which keys are on disk.
//

const root = path.resolve(import.meta.dirname);
const repoRoot = path.resolve(root, "../..");

const RECEIVING_SIDE_PORT = 4501;
const RECEIVING_SIDE_URL = `http://127.0.0.1:${RECEIVING_SIDE_PORT}`;

/**
 * Resolves the same key directory FileKeyProvider will use, and
 * generates a local ed25519 keypair for this example if the repo's
 * own keys (used by every other package in this repo) are absent —
 * e.g. on a fresh clone. Never hardcodes key material.
 */
function ensureKeysAvailable(): void {
  const repoKeysDir = path.join(repoRoot, "keys");

  const repoKeysExist =
    existsSync(path.join(repoKeysDir, "default.private.pem")) &&
    existsSync(path.join(repoKeysDir, "default.public.pem"));

  if (repoKeysExist) {
    return;
  }

  const exampleKeysDir = path.join(root, ".keys");

  const exampleKeysExist =
    existsSync(path.join(exampleKeysDir, "default.private.pem")) &&
    existsSync(path.join(exampleKeysDir, "default.public.pem"));

  if (!exampleKeysExist) {
    console.log(
      `No keys found at ${repoKeysDir}; generating ed25519 keys ` +
        `into ${exampleKeysDir} via generate-keypair.ts ...`,
    );

    execFileSync(
      process.execPath,
      [
        "./node_modules/tsx/dist/cli.mjs",
        path.join(
          repoRoot,
          "packages/crypto/scripts/generate-keypair.ts",
        ),
        "--algorithm",
        "ed25519",
      ],
      {
        cwd: repoRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          PARMANA_KEY_DIR: exampleKeysDir,
        },
      },
    );
  }

  process.env.PARMANA_KEY_DIR = exampleKeysDir;
}

/**
 * Records the ExecutionRequest Parmana forwards downstream, then
 * behaves exactly like @parmana/execution-system's HttpExecutionSystem
 * (POSTs to "<baseUrl>/execute") — except it also records the HTTP
 * response so this example can show it as proof of Scenario 1.
 */
class RecordingHttpExecutionSystem implements ExecutionSystem {
  public lastRequest?: ExecutionRequest;
  public lastResponseStatus?: number;
  public lastResponseBody?: unknown;

  constructor(private readonly baseUrl: string) {}

  async execute(
    request: ExecutionRequest,
  ): Promise<ExecutionResult> {
    this.lastRequest = request;

    const response = await fetch(`${this.baseUrl}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    this.lastResponseStatus = response.status;
    this.lastResponseBody = await response.json();

    if (!response.ok) {
      throw new Error(
        `Execution System returned HTTP ${response.status}.`,
      );
    }

    return {
      businessTransactionId: request.businessTransactionId,
      action: request.action,
      target: request.target,
      parameters: request.parameters,
      success: true,
      executedAt: new Date(),
      metadata: this.lastResponseBody as Record<string, unknown>,
    };
  }
}

/**
 * RECEIVING SIDE.
 *
 * An independent Express server that never talks to Parmana's
 * runtime or database. It only holds Parmana's public key and
 * verifies incoming envelopes with @parmana/envelope-verifier.
 */
async function startReceivingSide(): Promise<{
  url: string;
  server: Server;
}> {
  const publicKey =
    await new FileKeyProvider().getPublicKey("default");

  const verifier = new EnvelopeVerifier({
    publicKey,
    nonceStore: new MemoryNonceStore(),
  });

  const app = express();
  app.use(express.json());

  app.post(
    "/execute",
    requireParmanaAuthorization(verifier),
    (req, res) => {
      res.status(200).json({
        accepted: true,
        businessTransactionId: (
          req.body as { businessTransactionId?: string }
        ).businessTransactionId,
        checks: req.parmanaAuthorization?.checks,
      });
    },
  );

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(
      RECEIVING_SIDE_PORT,
      "127.0.0.1",
      () => resolve(listening),
    );
  });

  return { url: RECEIVING_SIDE_URL, server };
}

async function postToReceivingSide(
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${RECEIVING_SIDE_URL}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

async function main(): Promise<void> {
  console.log("========================================");
  console.log(" Parmana Example 04 - Verified Execution");
  console.log("========================================");

  ensureKeysAvailable();

  //
  // RECEIVING SIDE starts first so it is ready to receive the
  // request Parmana's runtime forwards during execution below.
  //
  printHeading("RECEIVING SIDE: Starting Verification Server");

  const { server } = await startReceivingSide();

  console.log(`Listening on ${RECEIVING_SIDE_URL}`);

  //
  // PARMANA SIDE: configure the runtime.
  //
  printHeading("PARMANA SIDE: Configure Runtime");

  const transactions = new MemoryBusinessTransactionRepository();
  const trustRecords = new MemoryExecutionTrustRecordRepository();

  const policyRepository = new FilePolicyRepository(
    path.join(repoRoot, "policies"),
  );

  const executionSystem = new RecordingHttpExecutionSystem(
    RECEIVING_SIDE_URL,
  );

  const application = RuntimeFactory.create(
    transactions,
    trustRecords,
    policyRepository,
    executionSystem,
  );

  console.log(
    "Runtime configured with a custom ExecutionSystem that " +
      `forwards approved requests to ${RECEIVING_SIDE_URL}.`,
  );

  //
  // PARMANA SIDE: submit an approved Business Transaction.
  //
  printHeading("PARMANA SIDE: Submit Approved Business Transaction");

  const transaction = JSON.parse(
    readFileSync(path.join(root, "transaction.json"), "utf8"),
  ) as BusinessTransaction;

  print("Business Transaction", transaction);

  const trustRecord = await application.execute(transaction);

  console.log();
  console.log(
    "Runtime execution complete. This internally: evaluated the " +
      "policy, signed the Execution Authorization, forwarded the " +
      "request to the receiving side (Scenario 1, below), verified " +
      "the resulting Trust Record, and generated a Receipt.",
  );

  const outgoingRequest = executionSystem.lastRequest!;
  const authorization: SignedExecutionAuthorization =
    outgoingRequest.authorization;

  print(
    "Signed Execution Authorization attached to the outgoing " +
      "ExecutionRequest",
    authorization,
  );

  print("Execution Trust Record", trustRecord);

  //
  // Scenario 1 already happened above, as a real HTTP round trip —
  // this is that same result.
  //
  printHeading(
    "RECEIVING SIDE: Scenario 1 - Valid envelope (already happened above)",
  );

  console.log(`HTTP ${executionSystem.lastResponseStatus}`);
  print("Response body", executionSystem.lastResponseBody);

  //
  // Scenario 2: replay the exact same envelope.
  //
  printHeading("RECEIVING SIDE: Scenario 2 - Replayed envelope");

  const replay = await postToReceivingSide(outgoingRequest);

  console.log(`HTTP ${replay.status}`);
  print("Response body", replay.body);

  //
  // Scenario 3: tamper with the payload after the fact.
  //
  printHeading("RECEIVING SIDE: Scenario 3 - Tampered payload");

  const tamperedRequest: ExecutionRequest = {
    ...outgoingRequest,
    authorization: {
      ...authorization,
      payload: {
        ...authorization.payload,
        decisionId: "tampered-decision-id",
      },
    },
  };

  const tampered = await postToReceivingSide(tamperedRequest);

  console.log(`HTTP ${tampered.status}`);
  print("Response body", tampered.body);

  //
  // Scenario 4: no authorization at all.
  //
  printHeading("RECEIVING SIDE: Scenario 4 - Missing authorization");

  const { authorization: _omit, ...requestWithoutAuthorization } =
    outgoingRequest;

  const missing = await postToReceivingSide(
    requestWithoutAuthorization,
  );

  console.log(`HTTP ${missing.status}`);
  print("Response body", missing.body);

  //
  // Summary.
  //
  printHeading("Summary");

  console.log(
    [
      "1. Valid envelope           -> " +
        `HTTP ${executionSystem.lastResponseStatus} (accepted)`,
      `2. Replayed envelope        -> HTTP ${replay.status} ` +
        "(nonceUnseen: false)",
      `3. Tampered payload         -> HTTP ${tampered.status} ` +
        "(signatureVerified: false)",
      `4. Missing authorization    -> HTTP ${missing.status}`,
    ].join("\n"),
  );

  server.close();

  console.log();
  console.log("Example Complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
