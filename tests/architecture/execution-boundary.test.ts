import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Phase 1E — permanent architecture enforcement.
 *
 * These tests do not verify today's implementation; they verify the
 * INVARIANT: there is exactly one production execution pipeline
 * (RuntimeEngine -> ExecutionGateway.execute() -> Gateway-owned Adapter),
 * and nothing outside execution-gateway owns production execution. Every
 * check below scans `packages/*\/src` generically (not a fixed file list),
 * so a new package or a new file introducing a second execution path is
 * caught automatically, not just today's known files.
 *
 * Each allowlist is a closed, named set of pre-approved exceptions with a
 * one-line reason. Anything not on a list is a violation and fails the
 * build. Widening a list is a deliberate, reviewable code change — not
 * something that happens by accident.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const packagesDir = join(repoRoot, "packages");

function listPackages(): string[] {
  return readdirSync(packagesDir).filter((name) => statSync(join(packagesDir, name)).isDirectory());
}

/** Recursively lists .ts source files under `dir`, skipping node_modules/dist. */
function listTsFiles(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];

  const results: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      results.push(full);
    }
  }

  return results;
}

function toRepoRelative(absPath: string): string {
  return relative(repoRoot, absPath).split("\\").join("/");
}

/** All production `src/` files across every package, keyed by repo-relative path. */
function allPackageSrcFiles(): ReadonlyMap<string, string> {
  const files = new Map<string, string>();

  for (const pkg of listPackages()) {
    const srcDir = join(packagesDir, pkg, "src");
    for (const file of listTsFiles(srcDir)) {
      files.set(toRepoRelative(file), readFileSync(file, "utf8"));
    }
  }

  return files;
}

describe("execution boundary — exactly one production execution pipeline", () => {
  const srcFiles = allPackageSrcFiles();

  it("found production source files to scan (sanity check the scan itself isn't vacuous)", () => {
    expect(srcFiles.size).toBeGreaterThan(50);
  });

  describe("adapter ownership: only execution-gateway may implement Connector", () => {
    // The 2-arg Connector (execute(request, context)) from @parmana/connector-sdk is the
    // shape real vendor adapters implement. The 1-arg Connector from
    // @parmana/execution-gateway's own Connector.ts is the legacy/generic extension
    // point (HttpConnector, the connector-runtime subsystem) — also gateway-owned.
    const allowedImplementors = new Set<string>([
      "packages/execution-gateway/src/HttpConnector.ts",
      "packages/execution-gateway/src/connector-execution/GatewayRazorpayAdapter.ts",
      "packages/execution-gateway/src/connector-execution/GatewayHubSpotAdapter.ts",
      "packages/execution-gateway/src/connector-execution/GatewayHttpAdapter.ts",
      // Explicit, intentional test double — never executes a real vendor call,
      // never constructed by production bootstrap. See MockConnector.ts.
      "packages/connector-sdk/src/MockConnector.ts",
    ]);

    const implementors = [...srcFiles.entries()]
      .filter(([, content]) => /\bimplements\s+Connector\b/.test(content))
      .map(([path]) => path);

    it("every `implements Connector` in packages/*/src is on the approved list", () => {
      const unapproved = implementors.filter((path) => !allowedImplementors.has(path));
      expect(unapproved).toEqual([]);
    });

    it("every file outside packages/execution-gateway implementing Connector is the named MockConnector exception", () => {
      const outsideGateway = implementors.filter((path) => !path.startsWith("packages/execution-gateway/"));
      expect(outsideGateway).toEqual(["packages/connector-sdk/src/MockConnector.ts"]);
    });
  });

  describe("no direct connector.execute()/adapter.execute() call outside approved gateway-owned components", () => {
    // Matches call sites like `connector.execute(`, `this.options.connector.execute(`
    // — not method *definitions* (which look like `execute(request...) {`).
    const callSitePattern = /\bconnector\.execute\(|\badapter\.execute\(/;

    const allowedCallers = new Set<string>([
      // Canonical dispatch, stage 1: ExecutionControlService resolves a
      // SecureConnector from the registry and calls SecureConnector.execute()
      // — this is the execution-control abstraction (policy/session/credential
      // checks), not the raw vendor Connector.
      "packages/execution-control/src/ExecutionControlService.ts",
      // Canonical dispatch, stage 2: after policy/authorization/credential
      // checks pass, SdkConnectorExecutor calls the raw vendor Connector.
      "packages/execution-gateway/src/connector-execution/SdkConnectorExecutor.ts",
      // Approved gateway-owned verification infrastructure (not business-action
      // execution): a read-only fetch-verify call confirming a webhook's claimed
      // settlement state against the vendor, documented at length in
      // RazorpaySettlementProcessor.ts's own class comment ("the webhook is a
      // doorbell, not a delivery"). Pre-dates Phase 1C/1D/1E; not a bypass of
      // authorized business-action execution, which still only ever happens
      // through ExecutionGateway.execute().
      "packages/api/src/webhooks/RazorpaySettlementProcessor.ts",
    ]);

    const allSrcFiles = new Map<string, string>([
      ...srcFiles,
      // RazorpaySettlementProcessor lives in packages/api/src/webhooks, already
      // covered by allPackageSrcFiles() — included here for clarity only.
    ]);

    const callers = [...allSrcFiles.entries()]
      .filter(([, content]) => callSitePattern.test(content))
      .map(([path]) => path);

    it("every connector.execute()/adapter.execute() call site is on the approved list", () => {
      const unapproved = callers.filter((path) => !allowedCallers.has(path));
      expect(unapproved).toEqual([]);
    });
  });

  describe("RuntimeEngine cannot bypass ExecutionGateway", () => {
    const path = "packages/runtime/src/RuntimeEngine.ts";
    const content = srcFiles.get(path);

    it("RuntimeEngine.ts exists and was scanned", () => {
      expect(content).toBeDefined();
    });

    it("does not import execution-gateway, connector-sdk, or connector-hubspot", () => {
      expect(content).not.toMatch(/from ["']@parmana\/execution-gateway["']/);
      expect(content).not.toMatch(/from ["']@parmana\/connector-sdk["']/);
      expect(content).not.toMatch(/from ["']@parmana\/connector-hubspot["']/);
    });

    it("does not construct a Gateway/Connector/Http adapter or call fetch() directly", () => {
      expect(content).not.toMatch(/new (Gateway|Connector|Http|Razorpay|HubSpot)\w*\(/);
      expect(content).not.toMatch(/\bfetch\(/);
    });
  });

  describe("ExecutionTrustApplication cannot bypass ExecutionGateway", () => {
    const path = "packages/runtime/src/ExecutionTrustApplication.ts";
    const content = srcFiles.get(path);

    it("ExecutionTrustApplication.ts exists and was scanned", () => {
      expect(content).toBeDefined();
    });

    it("does not import execution-gateway, connector-sdk, or connector-hubspot", () => {
      expect(content).not.toMatch(/from ["']@parmana\/execution-gateway["']/);
      expect(content).not.toMatch(/from ["']@parmana\/connector-sdk["']/);
      expect(content).not.toMatch(/from ["']@parmana\/connector-hubspot["']/);
    });

    it("does not construct a Gateway/Connector/Http adapter or call fetch() directly", () => {
      expect(content).not.toMatch(/new (Gateway|Connector|Http|Razorpay|HubSpot)\w*\(/);
      expect(content).not.toMatch(/\bfetch\(/);
    });
  });

  describe("API routes never execute adapters directly", () => {
    const routeFiles = [...srcFiles.entries()].filter(([path]) => path.startsWith("packages/api/src/routes/"));

    it("found route files to scan", () => {
      expect(routeFiles.length).toBeGreaterThan(0);
    });

    it.each(routeFiles)("%s does not import or construct an adapter", (path, content) => {
      expect(content).not.toMatch(/from ["']@parmana\/execution-gateway["']/);
      expect(content).not.toMatch(/new (Gateway|Razorpay|HubSpot)\w*Adapter\(/);
      expect(content).not.toMatch(/\bfetch\(/);
    });
  });

  describe("workers never execute adapters directly unless named as gateway-owned verification infrastructure", () => {
    // Task 4/6's "worker" carve-out: RazorpaySettlementProcessor (driven by
    // scripts/process-razorpay-settlements.ts) is the one named, approved
    // exception — see the call-site allowlist above for why. This block
    // confirms no *other* file under packages/api/src/webhooks constructs an
    // adapter or calls fetch() directly.
    const webhookFiles = [...srcFiles.entries()].filter(([path]) => path.startsWith("packages/api/src/webhooks/"));

    const approvedWorkerExceptions = new Set<string>(["packages/api/src/webhooks/RazorpaySettlementProcessor.ts"]);

    it.each(webhookFiles)("%s does not call fetch() directly unless it is the approved exception", (path, content) => {
      if (approvedWorkerExceptions.has(path)) {
        return;
      }
      expect(content).not.toMatch(/\bfetch\(/);
    });
  });

  describe("bootstrap composes but never executes business actions", () => {
    const bootstrapFiles = [...srcFiles.entries()].filter((entry) => entry[0].startsWith("packages/api/src/bootstrap/"));

    it("found bootstrap files to scan", () => {
      expect(bootstrapFiles.length).toBeGreaterThan(0);
    });

    it.each(bootstrapFiles)("%s never calls .execute(", (path, content) => {
      expect(content).not.toMatch(/\.execute\(/);
    });
  });

  describe("connector packages own no production execution", () => {
    const connectorPackages = listPackages().filter((name) => name.startsWith("connector-"));

    it("found at least the known connector packages", () => {
      expect(connectorPackages.length).toBeGreaterThanOrEqual(2);
    });

    for (const pkg of connectorPackages) {
      const files = [...srcFiles.entries()].filter(([path]) => path.startsWith(`packages/${pkg}/src/`));

      it.each(files)(`packages/${pkg}: %s makes no fetch() call`, (_path, content) => {
        expect(content).not.toMatch(/\bfetch\(/);
      });
    }
  });

  describe("exactly one ExecutionSystem binding in production composition", () => {
    const path = "packages/api/src/bootstrap/createExecutionSystem.ts";
    const content = srcFiles.get(path);

    it("createExecutionSystem.ts exists and was scanned", () => {
      expect(content).toBeDefined();
    });

    it("binds ExecutionSystem to createExecutionGateway() and nothing else", () => {
      expect(content).toMatch(/return createExecutionGateway\(\)/);
      // No other execution-system-shaped factory or adapter constructed here.
      expect(content).not.toMatch(/new (Gateway|Connector|Http|Razorpay|HubSpot)\w*\(/);
    });
  });
});
