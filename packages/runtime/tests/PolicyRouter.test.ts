import { describe, expect, it } from "vitest";

import path from "node:path";

import { PolicyRouter } from "../src/policy/PolicyRouter.js";

describe(
  "PolicyRouter",
  () => {

    const router = new PolicyRouter(
      path.resolve(
        process.cwd(),
        "../../policies",
      ),
    );

    it(
      "loads access-control policy",
      () => {

        const policy = router.load({
          name: "access-control",
          version: "1.0.0",
          schemaVersion: "1.0.0",
        });

        expect(
          policy.policyId,
        ).toBe("access-control");

        expect(
          policy.policyVersion,
        ).toBe("1.0.0");
      },
    );

    it(
      "loads vendor-payment policy",
      () => {

        const policy = router.load({
          name: "vendor-payment",
          version: "2.0.0",
          schemaVersion: "1.0.0",
        });

        expect(
          policy.policyId,
        ).toBe("vendor-payment");

        expect(
          policy.policyVersion,
        ).toBe("2.0.0");
      },
    );

    it(
      "throws for unknown policy",
      () => {

        expect(() =>
          router.load({
            name: "does-not-exist",
            version: "1.0.0",
            schemaVersion: "1.0.0",
          }),
        ).toThrow();
      },
    );

    it(
      "throws for incorrect version",
      () => {

        expect(() =>
          router.load({
            name: "access-control",
            version: "9.9.9",
            schemaVersion: "1.0.0",
          }),
        ).toThrow();
      },
    );
  },
);