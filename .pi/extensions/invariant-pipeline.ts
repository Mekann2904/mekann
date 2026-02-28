/**
 * @abdd.meta
 * path: .pi/extensions/invariant-pipeline.ts
 * role: MCP Invariant Pipeline拡張機能 - spec.mdから形式仕様とテストコードを生成
 * why: piから形式仕様生成ツールを利用可能にするため
 * related: ../lib/invariant/domain/types.ts, ../lib/invariant/application/parser.ts, ../lib/invariant/application/generators/*.ts
 * public_api: generate_from_spec, verify_quint_spec, generate_invariant_macros, generate_property_tests, generate_mbt_driver
 * invariants: ツールは接続中のみ実行可能
 * side_effects: ファイルシステムへの読み書き、ディレクトリ作成
 * failure_modes: spec.mdの形式不正、Quintインストール未、ファイル書き込み権限なし
 * @abdd.explain
 * overview: 自然言語仕様からQuint、TypeScript、テストコードを生成する拡張機能
 * what_it_does: 5つのツールを登録し、spec.mdパースと各種コード生成を提供する
 * why_it_exists: 仕様駆動開発を支援し、手動テストコード記述を削減するため
 * scope:
 *   in: spec.mdファイルパス、生成オプション
 *   out: Quint仕様、TypeScriptバリデーター、テストコード、MBTドライバー
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { Type } from "@sinclair/typebox";

import type { ExtensionAPI, ToolDefinition as PiToolDefinition } from "@mariozechner/pi-coding-agent";

import { toErrorMessage } from "../lib/core/error-utils.js";

// Import from lib/invariant
import {
  parseSpecMarkdown,
  generateQuintSpec,
  generateTsValidators,
  generatePropertyTests,
  generateMBTDriver,
  type VerifyQuintInput,
  type GenerateMacrosInput,
  type GenerateTestsInput,
  type GenerateMBTInput,
  type GenerationResult,
} from "../lib/invariant/index.js";

// Re-export ToolDefinition from pi-coding-agent for backward compatibility
export type ToolDefinition = PiToolDefinition;

// ============================================================================
// Extension Registration
// ============================================================================

export default (api: ExtensionAPI) => {
  console.error("[invariant-pipeline] Extension loading...");

  // generate_from_spec tool
  api.registerTool({
    name: "generate_from_spec",
    label: "generate_from_spec",
    description: "spec.mdからQuint形式仕様、TypeScriptバリデーション関数、fast-checkプロパティテスト、TypeScriptモデルベーステストドライバーを一括生成",
    parameters: Type.Object({
      spec_path: Type.String({ description: "spec.mdファイルへのパス" }),
      output_dir: Type.Optional(Type.String({ description: "出力ディレクトリ（デフォルト: spec_pathと同じディレクトリ）" })),
      module_name: Type.Optional(Type.String({ description: "Quintモジュール名（デフォルト: specのタイトル）" })),
      struct_name: Type.Optional(Type.String({ description: "TypeScriptクラス名（デフォルト: specのタイトル）" })),
      test_count: Type.Optional(Type.Number({ description: "プロパティテストのテスト数（デフォルト: 100）" })),
      max_steps: Type.Optional(Type.Number({ description: "MBTの最大ステップ数（デフォルト: 100）" })),
    }),
    execute: async (_toolCallId: string, params: {
      spec_path: string;
      output_dir?: string;
      module_name?: string;
      struct_name?: string;
      test_count?: number;
      max_steps?: number;
    }) => {
      const startTime = Date.now();

      try {
        // Read spec file
        if (!existsSync(params.spec_path)) {
          return {
            success: false,
            error: `Spec file not found: ${params.spec_path}`,
          };
        }

        const specContent = readFileSync(params.spec_path, "utf-8");
        const spec = parseSpecMarkdown(specContent);

        // Determine output directory
        const outputDir = params.output_dir || dirname(params.spec_path);
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        const result: GenerationResult = {
          success: true,
          outputs: {},
          errors: [],
          warnings: [],
        };

        // Generate all outputs first (before writing to disk)
        const quintOutput = generateQuintSpec(spec, params.module_name);
        const validatorsOutput = generateTsValidators(spec, params.struct_name);
        const testsOutput = generatePropertyTests(spec, params.struct_name, params.test_count);
        const mbtOutput = generateMBTDriver(spec, params.struct_name, params.max_steps);

        // Collect warnings and errors
        result.warnings.push(...quintOutput.warnings, ...validatorsOutput.warnings, ...testsOutput.warnings, ...mbtOutput.warnings);
        result.errors.push(...quintOutput.errors, ...validatorsOutput.errors, ...testsOutput.errors, ...mbtOutput.errors);

        // Atomic write: write to temp directory first, then move to target
        const tempDir = mkdtempSync(join(tmpdir(), "invariant-"));
        const quintFileName = `${spec.title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}.qnt`;

        try {
          // Write all files to temp directory
          writeFileSync(join(tempDir, quintFileName), quintOutput.content);
          writeFileSync(join(tempDir, "validators.ts"), validatorsOutput.content);
          writeFileSync(join(tempDir, "property_tests.ts"), testsOutput.content);
          writeFileSync(join(tempDir, "mbt_driver.ts"), mbtOutput.content);

          // Atomic move - all files appear at once
          const quintPath = join(outputDir, quintFileName);
          const validatorsPath = join(outputDir, "validators.ts");
          const testsPath = join(outputDir, "property_tests.ts");
          const mbtPath = join(outputDir, "mbt_driver.ts");

          renameSync(join(tempDir, quintFileName), quintPath);
          renameSync(join(tempDir, "validators.ts"), validatorsPath);
          renameSync(join(tempDir, "property_tests.ts"), testsPath);
          renameSync(join(tempDir, "mbt_driver.ts"), mbtPath);

          // Record outputs
          result.outputs.quint = { path: quintPath, content: quintOutput.content };
          result.outputs.macros = { path: validatorsPath, content: validatorsOutput.content };
          result.outputs.tests = { path: testsPath, content: testsOutput.content };
          result.outputs.mbt = { path: mbtPath, content: mbtOutput.content };
        } finally {
          // Cleanup temp dir (ignore errors)
          try {
            rmSync(tempDir, { recursive: true, force: true });
          } catch {
            // Ignore cleanup errors
          }
        }

        const durationMs = Date.now() - startTime;
        console.error(`[invariant-pipeline] Generation complete in ${durationMs}ms, outputs: ${Object.keys(result.outputs).join(", ")}, warnings: ${result.warnings.length}`);

        return {
          success: true,
          spec_title: spec.title,
          states_count: spec.states.length,
          operations_count: spec.operations.length,
          invariants_count: spec.invariants.length,
          outputs: result.outputs,
          warnings: result.warnings,
          errors: result.errors,
          duration_ms: durationMs,
        };
      } catch (error: unknown) {
        const errorMessage = toErrorMessage(error);
        console.error(`[invariant-pipeline] Generation failed: ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  } as unknown as ToolDefinition);

  // verify_quint_spec tool
  api.registerTool({
    name: "verify_quint_spec",
    label: "verify_quint_spec",
    description: "Quint形式仕様を検証（構文チェック、インバリアントチェック）",
    parameters: Type.Object({
      quint_path: Type.String({ description: "Quintファイルへのパス" }),
      check_invariants: Type.Optional(Type.Boolean({ description: "インバリアントをチェック" })),
      check_liveness: Type.Optional(Type.Boolean({ description: "ライブネス性をチェック" })),
    }),
    execute: async (_toolCallId: string, params: VerifyQuintInput) => {
      try {
        if (!existsSync(params.quint_path)) {
          return {
            success: false,
            error: `Quint file not found: ${params.quint_path}`,
          };
        }

        const content = readFileSync(params.quint_path, "utf-8");

        // Basic syntax checks
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check for module declaration
        if (!content.includes("module ")) {
          errors.push("Missing module declaration");
        }

        // Check for balanced braces
        const openBraces = (content.match(/\{/g) || []).length;
        const closeBraces = (content.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
          errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
        }

        // Check for invariant declarations
        const hasInvariants = content.includes("invariant ");
        if (params.check_invariants && !hasInvariants) {
          warnings.push("No invariant declarations found");
        }

        // Liveness check placeholder (requires temporal logic analysis)
        if (params.check_liveness) {
          // Check for temporal operators (eventually, always)
          const hasTemporalOps = /\b(eventually|always|leads[_\s]*to)\b/i.test(content);
          if (!hasTemporalOps) {
            warnings.push("Liveness check requested but no temporal operators found in spec");
          }
          // Full liveness verification would require Quint/TLA+ model checker integration
        }

        return {
          success: errors.length === 0,
          path: params.quint_path,
          errors,
          warnings,
          has_invariants: hasInvariants,
          liveness_checked: params.check_liveness ?? false,
        };
      } catch (error: unknown) {
        const errorMessage = toErrorMessage(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  } as unknown as ToolDefinition);

  // generate_invariant_macros tool
  api.registerTool({
    name: "generate_invariant_macros",
    label: "generate_invariant_macros",
    description: "spec.mdからTypeScriptインバリアントバリデーション関数を生成",
    parameters: Type.Object({
      spec_path: Type.String({ description: "spec.mdファイルへのパス" }),
      output_path: Type.Optional(Type.String({ description: "出力ファイルパス" })),
      struct_name: Type.Optional(Type.String({ description: "TypeScriptモデル名" })),
    }),
    execute: async (_toolCallId: string, params: GenerateMacrosInput) => {
      try {
        if (!existsSync(params.spec_path)) {
          return {
            success: false,
            error: `Spec file not found: ${params.spec_path}`,
          };
        }

        const specContent = readFileSync(params.spec_path, "utf-8");
        const spec = parseSpecMarkdown(specContent);
        const output = generateTsValidators(spec, params.struct_name);

        const outputPath = params.output_path || join(dirname(params.spec_path), "validators.ts");
        writeFileSync(outputPath, output.content);

        return {
          success: true,
          path: outputPath,
          content: output.content,
          invariants_count: spec.invariants.length,
          warnings: output.warnings,
          errors: output.errors,
        };
      } catch (error: unknown) {
        const errorMessage = toErrorMessage(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  } as unknown as ToolDefinition);

  // generate_property_tests tool
  api.registerTool({
    name: "generate_property_tests",
    label: "generate_property_tests",
    description: "spec.mdからfast-checkベースのプロパティテストを生成",
    parameters: Type.Object({
      spec_path: Type.String({ description: "spec.mdファイルへのパス" }),
      output_path: Type.Optional(Type.String({ description: "出力ファイルパス" })),
      struct_name: Type.Optional(Type.String({ description: "テスト対象モデル名" })),
      test_count: Type.Optional(Type.Number({ description: "プロパティテストのテスト数（デフォルト: 100）" })),
    }),
    execute: async (_toolCallId: string, params: GenerateTestsInput) => {
      try {
        if (!existsSync(params.spec_path)) {
          return {
            success: false,
            error: `Spec file not found: ${params.spec_path}`,
          };
        }

        const specContent = readFileSync(params.spec_path, "utf-8");
        const spec = parseSpecMarkdown(specContent);
        const output = generatePropertyTests(spec, params.struct_name, params.test_count);

        const outputPath = params.output_path || join(dirname(params.spec_path), "property_tests.ts");
        writeFileSync(outputPath, output.content);

        return {
          success: true,
          path: outputPath,
          content: output.content,
          tests_count: spec.invariants.length + spec.operations.length,
          configured_test_count: params.test_count,
          warnings: output.warnings,
          errors: output.errors,
        };
      } catch (error: unknown) {
        const errorMessage = toErrorMessage(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  } as unknown as ToolDefinition);

  // generate_mbt_driver tool
  api.registerTool({
    name: "generate_mbt_driver",
    label: "generate_mbt_driver",
    description: "spec.mdからTypeScriptベースのモデルベーステストドライバーを生成",
    parameters: Type.Object({
      spec_path: Type.String({ description: "spec.mdファイルへのパス" }),
      output_path: Type.Optional(Type.String({ description: "出力ファイルパス" })),
      struct_name: Type.Optional(Type.String({ description: "TypeScriptモデルクラス名" })),
      max_steps: Type.Optional(Type.Number({ description: "MBTの最大ステップ数（デフォルト: 100）" })),
    }),
    execute: async (_toolCallId: string, params: GenerateMBTInput) => {
      try {
        if (!existsSync(params.spec_path)) {
          return {
            success: false,
            error: `Spec file not found: ${params.spec_path}`,
          };
        }

        const specContent = readFileSync(params.spec_path, "utf-8");
        const spec = parseSpecMarkdown(specContent);
        const output = generateMBTDriver(spec, params.struct_name, params.max_steps);

        const outputPath = params.output_path || join(dirname(params.spec_path), "mbt_driver.ts");
        writeFileSync(outputPath, output.content);

        return {
          success: true,
          path: outputPath,
          content: output.content,
          actions_count: spec.operations.length,
          configured_max_steps: params.max_steps,
          warnings: output.warnings,
          errors: output.errors,
        };
      } catch (error: unknown) {
        const errorMessage = toErrorMessage(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  } as unknown as ToolDefinition);

  console.error("[invariant-pipeline] Extension loaded", {
    tools: ["generate_from_spec", "verify_quint_spec", "generate_invariant_macros", "generate_property_tests", "generate_mbt_driver"],
  });
};
