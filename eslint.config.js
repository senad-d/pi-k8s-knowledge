import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["node_modules/", ".pi/", "dist/", "coverage/"]),
  {
    files: ["**/*.js", "**/*.mjs", "**/*.ts"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      // Source validation deliberately rejects control characters.
      "no-control-regex": "off",
      // Best-effort parsing/cleanup may intentionally ignore a failed attempt.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Public errors deliberately omit underlying transport/storage details.
      "preserve-caught-error": "off",
    },
  },
]);
