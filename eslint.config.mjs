import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/*.d.ts",
      "**/coverage/**",
      "**/node_modules/**",

      // Legacy/generated JS examples
      "typescript/**",

      // Local scratch files
      "test.mjs",
    ],
  },

  {
    files: ["**/*.cjs", "**/*.mjs", "*.cjs", "*.mjs"],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "readonly",
        // Global since Node 18; this repo requires Node >=24
        // (docs/VERIFICATION-GAPS.md #16), so it's always available.
        fetch: "readonly",
      },
    },
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  {
    files: ["packages/**/*.ts", "examples/**/*.ts"],

    languageOptions: {
      parserOptions: {
        project: false,
      },
    },

    rules: {
      "no-console": "off",

      "no-unused-vars": "off",

      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];