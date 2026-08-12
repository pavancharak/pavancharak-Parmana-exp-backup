import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Phase 1G — lightweight documentation-reference validation.
 *
 * Not a prose/content checker (too heavyweight, too brittle for what this
 * needs to catch). Just the cheap, high-value check: every backtick-quoted
 * file path these architecture docs cite as evidence must actually exist.
 * A doc that says "see packages/foo/src/Bar.ts" about a file that got
 * renamed or deleted is worse than no citation at all — this catches that
 * the next time the doc (or the file) changes, instead of silently rotting.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const docsToCheck = [
  "docs/architecture/system-architecture.md",
  "docs/architecture/execution-walkthrough.md",
  "docs/developer/extending-parmana.md",
  "docs/architecture/execution-pipeline-report.md",
  "docs/architecture/repository-invariants.md",
];

/** Backtick-quoted paths that look like a real repo path (package src/tests, or docs/tests dirs). */
const PATH_PATTERN =
  /`((?:packages\/[\w-]+\/(?:src|tests)\/[\w\-./]+\.tsx?)|(?:tests\/architecture\/[\w\-./]+\.tsx?)|(?:docs\/[\w\-./]+\.md)|(?:policies\/?))`/g;

/**
 * Paths that are deliberately hypothetical, not evidence: either a "Regression
 * example" describing a file that must NOT exist (repository-invariants.md),
 * or a worked "how you'd add a new vendor" walkthrough using a not-yet-built
 * Stripe connector as the illustrative example (extending-parmana.md). Real
 * evidence citations still get checked; only these named, intentional
 * hypotheticals are excluded.
 */
const HYPOTHETICAL_EXAMPLE_PATHS = new Set([
  "packages/connector-stripe/src/StripeCapabilities.ts",
  "packages/execution-gateway/src/connector-execution/GatewayStripeAdapter.ts",
  "packages/execution-gateway/src/connector-execution/createGatewayStripeConnector.ts",
  "packages/api/src/bootstrap/createStripeConnector.ts",
  "packages/connector-stripe/src/StripeConnector.ts",
  "packages/api/src/routes/admin-replay.ts",
]);

/**
 * Paths that were real when cited, describing a genuine historical fact
 * (unlike HYPOTHETICAL_EXAMPLE_PATHS above, which were never real), but
 * whose subject was later deliberately removed rather than renamed or
 * fixed. The doc's own narrative is the historical record of what was
 * true at the time and why it changed — rewriting the citation itself
 * would falsify that record. `payments:execute`/vendor-payment was
 * removed outright, not independently verified (docs/VERIFICATION-GAPS.md
 * G-27) — `createVendorPaymentConnector.ts` and its dedicated credential
 * provider no longer exist anywhere in this repository. The same applies
 * to the Razorpay connector, deliberately removed in full (see the
 * removal commit and docs/CLAIMS.md's historical §3.4-3.9/3.8/3.9).
 */
const HISTORICALLY_REAL_NOW_REMOVED_PATHS = new Set([
  "packages/api/src/bootstrap/createVendorPaymentConnector.ts",
  "packages/api/src/webhooks/RazorpaySettlementProcessor.ts",
  "packages/api/src/bootstrap/createRazorpaySignalStateVerifier.ts",
  "packages/connector-sdk/src/connectors/razorpay/RazorpayCapabilities.ts",
]);

function extractReferencedPaths(content: string): string[] {
  const matches = [...content.matchAll(PATH_PATTERN)].map((m) => m[1]!);
  return [...new Set(matches)].filter(
    (path) =>
      !HYPOTHETICAL_EXAMPLE_PATHS.has(path) &&
      !HISTORICALLY_REAL_NOW_REMOVED_PATHS.has(path),
  );
}

describe("documentation file references resolve to real files", () => {
  for (const docPath of docsToCheck) {
    const absPath = join(repoRoot, docPath);

    it(`${docPath} exists`, () => {
      expect(existsSync(absPath)).toBe(true);
    });

    if (!existsSync(absPath)) continue;

    const content = readFileSync(absPath, "utf8");
    const referencedPaths = extractReferencedPaths(content);

    it(`${docPath} cites at least one file path (sanity check the scan isn't vacuous)`, () => {
      expect(referencedPaths.length).toBeGreaterThan(0);
    });

    it.each(referencedPaths)(`${docPath} references %s, which exists`, (referencedPath) => {
      const cleaned = referencedPath.endsWith("/") ? referencedPath.slice(0, -1) : referencedPath;
      expect(existsSync(join(repoRoot, cleaned))).toBe(true);
    });
  }
});
