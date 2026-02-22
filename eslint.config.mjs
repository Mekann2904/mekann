import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "error",
    },
  },
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "**/*.js",
      "**/*.d.ts",
      ".pi/.agent-teams-storage/**",
      ".pi/subagents/**",
      ".pi/agent-loop/**",
      ".pi/plans/**",
      ".pi/memory/**",
      "ABDD/**",
    ],
  }
);
