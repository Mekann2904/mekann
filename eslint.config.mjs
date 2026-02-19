/**
 * @abdd.meta
 * @path eslint.config.mjs
 * @role configuration
 * @why ESLint v9のflat config形式でTypeScriptコードの品質を維持する
 * @related .eslintrc.json, package.json
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
import ts from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import { includeIgnoreFile } from "@eslint/compat";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, ".gitignore");

export default [
  // gitignoreの内容を無視パターンに追加
  includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),

  // ベース設定
  js.configs.recommended,

  // TypeScript推奨設定
  ...ts.configs.recommended,

  // 共通設定
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },

    plugins: {
      import: importPlugin,
    },

    rules: {
      // TypeScript固有ルール
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-require-imports": "off",

      // 一般ルール
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "error",

      // インポート順序
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },

  // 対象ファイルパターン
  {
    files: ["**/*.ts", "**/*.tsx"],
  },

  // 無視するパターン
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "**/*.js",
      "**/*.d.ts",
      "**/node_modules/**",
    ],
  },
];
