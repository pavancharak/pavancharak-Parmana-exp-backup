import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Walks up from this file to find the repository's bundled OpenAPI
 * spec, mirroring the .env resolution in
 * packages/shared/src/config/Config.ts so this route works
 * identically under tsx (src/) and the compiled build (dist/).
 */
function findSpecFile(): string {
  let current = __dirname;

  while (true) {
    const candidate = join(current, "openapi", "openapi.bundled.yaml");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);

    if (parent === current) {
      throw new Error(
        "openapi/openapi.bundled.yaml not found in any parent directory. Run `npm run bundle:openapi`.",
      );
    }

    current = parent;
  }
}

const specPath = findSpecFile();
const specYaml = readFileSync(specPath, "utf8");

const spec = parse(specYaml);

if (!spec.openapi) {
  throw new Error("OpenAPI bundle is missing 'openapi'.");
}

if (!spec.info?.version) {
  throw new Error("OpenAPI bundle is missing info.version.");
}

if (!spec.paths) {
  throw new Error("OpenAPI bundle contains no paths.");
}

const router = Router();

router.get("/", (_req, res) => {
  res.set({
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });

  res.type("application/yaml").send(specYaml);
});

export default router;
