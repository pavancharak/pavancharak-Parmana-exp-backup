import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "**/test/**/*.test.ts",
      "**/tests/**/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
    ],
    environment: "node",
    passWithNoTests: true,

    // Integration tests can take longer
    testTimeout: 30000,
  },
});