import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const examples = [
  "tutorials/01-hello-world/run.ts",
  "tutorials/02-policy-evaluation/run.ts",
  "tutorials/03-runtime-execution/run.ts",
  "tutorials/04-policy-router/run.ts",
  "tutorials/05-verification/run.ts",
  "tutorials/06-replay/run.ts",
  "tutorials/07-receipt-generation/run.ts",
  "tutorials/08-human-approval/run.ts",
  "tutorials/09-rest-api/run.ts",
  "tutorials/10-end-to-end/run.ts",
    "tutorials/11-execution-authorization/run.ts",
  "tutorials/12-envelope-verification/run.ts",
  "tutorials/13-post-quantum-signatures/run.ts",

  "scenarios/vendor-payment/run.ts",
  "scenarios/expense-approval/run.ts",
  "scenarios/purchase-order/run.ts",
];

async function run(file: string): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log(`Running ${file}`);
  console.log("==================================================");
  console.log();

  const examplePath = path.join(
    __dirname,
    file,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "./node_modules/tsx/dist/cli.mjs",
        examplePath,
      ],
      {
        cwd: path.resolve(__dirname, ".."),
        stdio: "inherit",
      },
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${file} failed with exit code ${code}.`,
          ),
        );
      }
    });

    child.on("error", reject);
  });
}

(async () => {
  try {
    console.log();
    console.log("======================================");
    console.log("Running Parmana Examples");
    console.log("======================================");

    for (const file of examples) {
      await run(file);
    }

    console.log();
    console.log("======================================");
    console.log("All Parmana examples completed.");
    console.log("======================================");
  } catch (error) {
    console.error();
    console.error("Example execution failed.");
    console.error(error);

    process.exit(1);
  }
})();