/**
 * @abdd.meta
 * @path eslint.config.mjs
 * @role configuration
 * @why ESLint v9のflat config形式でTypeScriptコードの品質を維持する
 * @related package.json, tsconfig.json
 * @public_api false
 * @invariants []
 * @side_effects none
 * @failure_modes 設定ミスによるlintエラー
 *
 * @abdd.explain
 * @overview ESLint v9のflat config設定ファイル
 * @what_it_does TypeScriptコードのlintingルールを定義
 * @why_it_exists コード品質と一貫性を保つため
 * @scope(in) .pi/extensions/*.ts, .pi/lib/*.ts
 * @scope(out) node_modules, dist, *.js, *.d.ts
 */

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
      "@typescript-eslint/no-require-imports": "off",
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
      "scripts/**",
      "tests/**",
    ],
  }
);
