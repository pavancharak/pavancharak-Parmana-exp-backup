import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");

//
// examples/04-verified-execution is intentionally excluded: it
// binds a real TCP port (the "receiving side" HTTP server) and
// isn't safe to run unattended alongside the rest of this list.
// Run it individually — see examples/04-verified-execution/README.md.
//
const examples = [
  "examples/tutorials/01-hello-world/run.ts",
  "examples/tutorials/02-policy-evaluation/run.ts",
  "examples/tutorials/03-runtime-execution/run.ts",
  "examples/tutorials/04-policy-router/run.ts",
  "examples/tutorials/05-verification/run.ts",
  "examples/tutorials/06-replay/run.ts",
  "examples/tutorials/07-receipt-generation/run.ts",
  "examples/tutorials/08-human-approval/run.ts",
  "examples/tutorials/09-rest-api/run.ts",
  "examples/tutorials/10-end-to-end/run.ts",
    "examples/tutorials/11-execution-authorization/run.ts",
  "examples/tutorials/12-envelope-verification/run.ts",
  "examples/tutorials/13-post-quantum-signatures/run.ts",

  "examples/scenarios/vendor-payment/run.ts",
  "examples/scenarios/expense-approval/run.ts",
  "examples/scenarios/purchase-order/run.ts",
];

async function run(example: string): Promise<void> {
  console.log();
  console.log("============================================================");
  console.log(`Running ${example}`);
  console.log("============================================================");
  console.log();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "./node_modules/tsx/dist/cli.mjs",
        path.join(root, example),
      ],
      {
        cwd: root,
        stdio: "inherit",
      },
    );

    child.on("error", reject);

    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`✓ ${example} completed.`);
        resolve();
      } else {
        reject(
          new Error(
            `${example} failed with exit code ${code}.`,
          ),
        );
      }
    });
  });
}

async function main(): Promise<void> {
  console.log();
  console.log("============================================================");
  console.log("Parmana Example Runner");
  console.log("============================================================");

  for (const example of examples) {
    await run(example);
  }

  console.log();
  console.log("============================================================");
  console.log("✓ All Parmana examples completed successfully.");
  console.log("============================================================");
}

main().catch((error) => {
  console.error();
  console.error(error);
  process.exit(1);
});