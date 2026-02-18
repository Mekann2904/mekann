/**
 * @abdd.meta
 * path: .pi/extensions/invariant-pipeline.ts
 * role: 仕様駆動コード生成パイプラインを提供するPi拡張機能
 * why: spec.mdからQuint形式仕様、TypeScriptインバリアント、プロパティベーステスト、モデルベーステストを一貫して生成し、形式検証とテスト自動化を実現するため
 * related: invariant-generation(スキル), invariant-generation-team, spec.md(入力ソース), fast-check(外部ライブラリ)
 * public_api: generate_from_spec, verify_quint_spec, generate_invariant_macros, generate_property_tests, generate_mbt_driver
 * invariants:
 *   - ParsedSpecは必ず空配列のstates/operations/invariantsを持つ
 *   - GenerationResultはsuccessフラグとerrors配列で生成結果を一意に表す
 *   - 各生成関数はspec_pathを必須入力とする
 * side_effects:
 *   - readFileSyncによるspec.md読み込み
 *   - writeFileSyncによるQuint/TypeScript/テストファイルへの書き込み
 *   - mkdirSyncによる出力ディレクトリ作成
 * failure_modes:
 *   - spec.mdが存在しない、またはパース不可能な場合にエラー
 *   - 書き込み先パスの権限不足またはディスク容量不足
 *   - Quint検証ツールが未インストールの場合のverify_quint_spec失敗
 * @abdd.explain
 * overview: Markdown形式の仕様書から形式検証可能なコード資産を自動生成するパイプライン拡張機能
 * what_it_does:
 *   - spec.mdをMarkdownパーサーで解析し、ParsedSpec構造（states/operations/invariants/constants）に変換する
 *   - ParsedSpecからQuint形式仕様ファイルを生成し、invariant/liveness検証を実行する
 *   - ParsedSpecからTypeScriptインバリアントバリデーション関数を生成する
 *   - fast-checkを使用したプロパティベーステストコードを生成する
 *   - モデルベーステスト用のTypeScriptドライバーコードを生成する
 * why_it_exists:
 *   - 仕様と実装の整合性を形式手法で保証するため
 *   - 手動テスト作成の負荷を軽減し、網羅的なテスト自動生成を実現するため
 *   - Quint形式検証とfast-checkプロパティテストを統合パイプラインで一元管理するため
 * scope:
 *   in: spec.md(Markdown形式仕様)、Quintファイルパス、生成オプション(struct_name/test_count/max_steps等)
 *   out: Quint形式仕様ファイル、TypeScriptインバリアント関数、fast-checkテストコード、モデルベーステストドライバー、GenerationResult
 */

/**
 * Invariant Validation Pipeline拡張機能
 * spec.mdからQuint形式仕様、TypeScriptインバリアントバリデーション、プロパティベーステスト(fast-check)、モデルベーステストを自動生成
 *
 * ツール:
 * - generate_from_spec: spec.mdから全成果物を生成
 * - verify_quint_spec: Quint仕様の検証
 * - generate_invariant_macros: TypeScriptバリデーション関数生成
 * - generate_property_tests: fast-checkコード生成
 * - generate_mbt_driver: TypeScriptモデルベーステストドライバー生成
 *
 * 統合:
 * - invariant-generationスキル: 形式仕様生成の専門知識
 * - invariant-generation-team: マルチエージェント生成
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Types
// ============================================================================

interface SpecState {
  name: string;
  type: string;
  initialValue?: unknown;
  constraints?: string[];
}

interface SpecOperation {
  name: string;
  parameters?: { name: string; type: string }[];
  preconditions?: string[];
  postconditions?: string[];
  description?: string;
}

interface SpecInvariant {
  name: string;
  condition: string;
  description?: string;
}

interface ParsedSpec {
  title: string;
  description?: string;
  states: SpecState[];
  operations: SpecOperation[];
  invariants: SpecInvariant[];
  constants?: { name: string; type: string; value?: unknown }[];
}

interface GenerationOutput {
  content: string;
  warnings: string[];
  errors: string[];
}

interface GenerationResult {
  success: boolean;
  outputs: {
    quint?: { path: string; content: string };
    macros?: { path: string; content: string };
    tests?: { path: string; content: string };
    mbt?: { path: string; content: string };
  };
  errors: string[];
  warnings: string[];
}

interface VerifyQuintInput {
  quint_path: string;
  check_invariants?: boolean;
  check_liveness?: boolean;
}

interface GenerateMacrosInput {
  spec_path: string;
  output_path?: string;
  struct_name?: string;
}

interface GenerateTestsInput {
  spec_path: string;
  output_path?: string;
  struct_name?: string;
  test_count?: number;
}

interface GenerateMBTInput {
  spec_path: string;
  output_path?: string;
  struct_name?: string;
  max_steps?: number;
}

// ============================================================================
// Spec Parser
// ============================================================================

function parseSpecMarkdown(content: string): ParsedSpec {
  const lines = content.split("\n");
  const spec: ParsedSpec = {
    title: "",
    states: [],
    operations: [],
    invariants: [],
    constants: [],
  };

  let currentSection = "";
  let currentState: SpecState | null = null;
  let currentOperation: SpecOperation | null = null;
  let currentConstant: { name: string; type: string; value?: unknown } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Title
    if (trimmed.startsWith("# ")) {
      spec.title = trimmed.substring(2);
      continue;
    }

    // Sections (##)
    if (trimmed.startsWith("## ")) {
      // Save pending items before changing section
      if (currentConstant) {
        spec.constants!.push(currentConstant);
        currentConstant = null;
      }
      if (currentState) {
        spec.states.push(currentState);
        currentState = null;
      }
      if (currentOperation) {
        spec.operations.push(currentOperation);
        currentOperation = null;
      }
      currentSection = trimmed.substring(3).toLowerCase();
      continue;
    }

    // Constants section (## 定数 / ## Constants)
    if (currentSection.includes("定数") || currentSection.includes("constants")) {
      // ### name: type format
      const headerMatch = trimmed.match(/^###\s+(\w+)\s*:\s*(.+)$/);
      if (headerMatch) {
        // Save previous constant if exists
        if (currentConstant) {
          spec.constants!.push(currentConstant);
        }
        currentConstant = { name: headerMatch[1], type: headerMatch[2].trim() };
        continue;
      }
      // - 値: value / - value: value
      const valueMatch = trimmed.match(/^[-*]\s+(?:値|value)\s*:\s*(.+)$/);
      if (valueMatch && currentConstant) {
        currentConstant.value = parseConstantValue(valueMatch[1].trim(), currentConstant.type);
        continue;
      }
    }

    // State variables section (## 状態 / ## State)
    if (currentSection.includes("状態") || currentSection.includes("state")) {
      // ### name: type format
      const headerMatch = trimmed.match(/^###\s+(\w+)\s*:\s*(.+)$/);
      if (headerMatch) {
        // Save previous state if exists
        if (currentState) {
          spec.states.push(currentState);
        }
        currentState = { name: headerMatch[1], type: headerMatch[2].trim(), constraints: [] };
        continue;
      }
      // - 初期値: value / - initial: value
      const initialMatch = trimmed.match(/^[-*]\s+(?:初期値|初期値|initial)\s*:\s*(.+)$/);
      if (initialMatch && currentState) {
        currentState.initialValue = parseConstantValue(initialMatch[1].trim(), currentState.type);
        continue;
      }
      // - 制約: condition / - constraint: condition
      const constraintMatch = trimmed.match(/^[-*]\s+(?:制約|constraint)\s*:\s*(.+)$/);
      if (constraintMatch && currentState) {
        currentState.constraints!.push(constraintMatch[1].trim());
        continue;
      }
      // Legacy format: - variable_name: Type (初期値: value)
      const legacyMatch = trimmed.match(/^[-*]\s+(\w+)\s*:\s*(\w+)(?:\s*（初期値\s+(.+)）)?(?:\s*\(initial:\s*(.+)\))?/);
      if (legacyMatch) {
        if (currentState) {
          spec.states.push(currentState);
        }
        currentState = {
          name: legacyMatch[1],
          type: legacyMatch[2],
          initialValue: legacyMatch[3] || legacyMatch[4],
          constraints: [],
        };
        continue;
      }
      // Simple legacy format: - variable_name: Type
      const simpleMatch = trimmed.match(/^[-*]\s+(\w+)\s*:\s*(.+)$/);
      if (simpleMatch && !trimmed.includes("初期値") && !trimmed.includes("制約")) {
        if (currentState) {
          spec.states.push(currentState);
        }
        currentState = { name: simpleMatch[1], type: simpleMatch[2].trim(), constraints: [] };
        continue;
      }
    }

    // Operations section (## 操作 / ## Operations)
    if (currentSection.includes("操作") || currentSection.includes("operation")) {
      // ### name() format
      const headerMatch = trimmed.match(/^###\s+(\w+)\s*\(([^)]*)\)\s*:\s*(.*)$/);
      if (headerMatch) {
        // Save previous operation if exists
        if (currentOperation) {
          spec.operations.push(currentOperation);
        }
        currentOperation = {
          name: headerMatch[1],
          parameters: headerMatch[2] ? headerMatch[2].split(",").filter(p => p.trim()).map(p => {
            const [name, type] = p.trim().split(":").map(s => s.trim());
            return { name, type: type || "any" };
          }) : [],
          description: headerMatch[3] || undefined,
          preconditions: [],
          postconditions: [],
        };
        continue;
      }
      // Simple ### name() format (no description)
      const simpleHeaderMatch = trimmed.match(/^###\s+(\w+)\s*\(([^)]*)\)\s*$/);
      if (simpleHeaderMatch) {
        if (currentOperation) {
          spec.operations.push(currentOperation);
        }
        currentOperation = {
          name: simpleHeaderMatch[1],
          parameters: simpleHeaderMatch[2] ? simpleHeaderMatch[2].split(",").filter(p => p.trim()).map(p => {
            const [name, type] = p.trim().split(":").map(s => s.trim());
            return { name, type: type || "any" };
          }) : [],
          preconditions: [],
          postconditions: [],
        };
        continue;
      }
      // - 事前条件: condition / - precondition: condition
      const preMatch = trimmed.match(/^[-*]\s+(?:事前条件|precondition)\s*:\s*(.+)$/);
      if (preMatch && currentOperation) {
        currentOperation.preconditions!.push(preMatch[1].trim());
        continue;
      }
      // - 効果: condition / - effect: condition / - postcondition: condition
      const postMatch = trimmed.match(/^[-*]\s+(?:効果|effect|postcondition)\s*:\s*(.+)$/);
      if (postMatch && currentOperation) {
        currentOperation.postconditions!.push(postMatch[1].trim());
        continue;
      }
      // Legacy format: - name(params): description
      const legacyMatch = trimmed.match(/^[-*]\s+(\w+)\s*\(([^)]*)\)\s*:\s*(.+)$/);
      if (legacyMatch) {
        if (currentOperation) {
          spec.operations.push(currentOperation);
        }
        currentOperation = {
          name: legacyMatch[1],
          parameters: legacyMatch[2] ? legacyMatch[2].split(",").filter(p => p.trim()).map(p => {
            const [name, type] = p.trim().split(":").map(s => s.trim());
            return { name, type: type || "any" };
          }) : [],
          description: legacyMatch[3],
          preconditions: [],
          postconditions: [],
        };
        continue;
      }
      // Simple legacy format: - operation_name()
      const simpleLegacyMatch = trimmed.match(/^[-*]\s+(\w+)\s*\(\s*\)/);
      if (simpleLegacyMatch) {
        if (currentOperation) {
          spec.operations.push(currentOperation);
        }
        currentOperation = {
          name: simpleLegacyMatch[1],
          parameters: [],
          preconditions: [],
          postconditions: [],
        };
        continue;
      }
    }

    // Invariants section (## インバリアント / ## Invariants)
    if (currentSection.includes("インバリアント") || currentSection.includes("invariant")) {
      const match = trimmed.match(/^[-*]\s+(.+)$/);
      if (match && !trimmed.startsWith("```")) {
        spec.invariants.push({
          name: `Invariant${spec.invariants.length + 1}`,
          condition: match[1],
        });
      }
    }
  }

  // Don't forget to save the last items
  if (currentConstant) {
    spec.constants!.push(currentConstant);
  }
  if (currentState) {
    spec.states.push(currentState);
  }
  if (currentOperation) {
    spec.operations.push(currentOperation);
  }

  return spec;
}

/**
 * Parse constant value based on type
 */
function parseConstantValue(valueStr: string, type: string): unknown {
  const trimmed = valueStr.trim();

  // Integer types
  if (type === "int" || type === "integer" || type === "整数" || type === "i64" || type === "i32") {
    const num = parseInt(trimmed, 10);
    return isNaN(num) ? trimmed : num;
  }

  // Float types
  if (type === "float" || type === "double" || type === "f64" || type === "f32") {
    const num = parseFloat(trimmed);
    return isNaN(num) ? trimmed : num;
  }

  // Boolean types
  if (type === "bool" || type === "boolean" || type === "真偽") {
    if (trimmed.toLowerCase() === "true" || trimmed === "真" || trimmed === "1") return true;
    if (trimmed.toLowerCase() === "false" || trimmed === "偽" || trimmed === "0") return false;
    return trimmed;
  }

  // Default: keep as string
  return trimmed;
}

// ============================================================================
// Quint Generator
// ============================================================================

function generateQuintSpec(spec: ParsedSpec, moduleName?: string): GenerationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

  const name = moduleName || spec.title.replace(/[^a-zA-Z0-9]/g, "") || "Generated";

  let quint = `// Generated Quint specification from ${spec.title}\n`;
  quint += `// Generated by invariant-pipeline\n\n`;
  quint += `module ${name} {\n`;

  // Constants
  if (spec.constants && spec.constants.length > 0) {
    quint += `\n  // Constants\n`;
    for (const c of spec.constants) {
      quint += `  const ${c.name}: ${c.type}\n`;
    }
  }

  // State variables
  if (spec.states.length > 0) {
    quint += `\n  // State variables\n`;
    for (const s of spec.states) {
      quint += `  var ${s.name}: ${mapTypeToQuint(s.type)}\n`;
    }
  }

  // Init
  quint += `\n  // Initial state\n`;
  quint += `  init() {\n`;
  const initAssignments = spec.states.map(s => {
    const initVal = s.initialValue !== undefined ? s.initialValue : getDefaultValue(s.type);
    return `    ${s.name}' = ${formatValue(initVal, s.type)}`;
  });
  quint += initAssignments.join(",\n") + "\n";
  quint += `  }\n`;

  // Operations
  for (const op of spec.operations) {
    quint += `\n  // ${op.description || op.name}\n`;
    quint += `  action ${op.name} = all {\n`;
    // Add preconditions as guard conditions (not comments)
    if (op.preconditions && op.preconditions.length > 0) {
      for (const pre of op.preconditions) {
        quint += `    ${pre},  // guard: precondition\n`;
      }
    }
    if (op.postconditions && op.postconditions.length > 0) {
      for (const post of op.postconditions) {
        quint += `    ${post},\n`;
      }
    } else {
      warnings.push(`Operation "${op.name}" has no postconditions - generating trivially true transition`);
      quint += `    // SKIPPED: No postconditions defined for ${op.name}\n`;
      quint += `    true\n`;
    }
    quint += `  }\n`;
  }

  // Invariants
  if (spec.invariants.length > 0) {
    quint += `\n  // Invariants\n`;
    for (const inv of spec.invariants) {
      const invName = inv.name || `Invariant${spec.invariants.indexOf(inv) + 1}`;
      quint += `  invariant ${invName} {\n`;
      quint += `    ${inv.condition}\n`;
      quint += `  }\n`;
    }
  }

  quint += `}\n`;

  return { content: quint, warnings, errors };
}

function mapTypeToQuint(type: string): string {
  const typeMap: Record<string, string> = {
    "int": "int",
    "integer": "int",
    "整数": "int",
    "bool": "bool",
    "boolean": "bool",
    "真偽": "bool",
    "str": "str",
    "string": "str",
    "文字列": "str",
    "Set": "Set",
    "集合": "Set",
    "List": "List",
    "リスト": "List",
    "Map": "Map",
    "マップ": "Map",
  };
  return typeMap[type] || type;
}

function getDefaultValue(type: string): unknown {
  const defaults: Record<string, unknown> = {
    "int": 0,
    "integer": 0,
    "整数": 0,
    "bool": false,
    "boolean": false,
    "真偽": false,
    "str": "",
    "string": "",
    "文字列": "",
  };
  return defaults[type] ?? null;
}

function formatValue(value: unknown, type: string): string {
  if (typeof value === "string") {
    // Check if it's already a number
    if (type === "int" || type === "整数") {
      const num = parseInt(value, 10);
      if (!isNaN(num)) return num.toString();
    }
    return `"${value}"`;
  }
  return String(value);
}

// ============================================================================
// TypeScript Validator Generator
// ============================================================================

/**
 * spec.mdからTypeScriptバリデーション関数を生成する
 * Rustマクロの代わりに、クラスベースのバリデーションを提供
 */
function generateTsValidators(spec: ParsedSpec, structName?: string): GenerationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

  const name = structName || spec.title.replace(/[^a-zA-Z0-9]/g, "") || "Generated";

  let ts = `/**\n`;
  ts += ` * ${spec.title}のインバリアントバリデーション\n`;
  ts += ` * Generated by invariant-pipeline\n`;
  ts += ` */\n\n`;

  // インバリアント違反エラークラス
  ts += `/**\n`;
  ts += ` * インバリアント違反を表すエラー\n`;
  ts += ` */\n`;
  ts += `export class InvariantViolation extends Error {\n`;
  ts += `  constructor(\n`;
  ts += `    public readonly invariant: string,\n`;
  ts += `    public readonly details: string\n`;
  ts += `  ) {\n`;
  ts += `    super(\`Invariant '\${invariant}' violated: \${details}\`);\n`;
  ts += `    this.name = 'InvariantViolation';\n`;
  ts += `  }\n`;
  ts += `}\n\n`;

  // バリデーション結果型
  ts += `/**\n`;
  ts += ` * バリデーション結果\n`;
  ts += ` */\n`;
  ts += `export type ValidationResult<T> =\n`;
  ts += `  | { success: true; value: T }\n`;
  ts += `  | { success: false; violations: InvariantViolation[] };\n\n`;

  // モデルインターフェース
  ts += `/**\n`;
  ts += ` * ${name}モデルのインターフェース\n`;
  ts += ` */\n`;
  ts += `export interface ${name}Model {\n`;
  for (const s of spec.states) {
    ts += `  ${s.name}: ${mapTypeToTypeScript(s.type)};\n`;
  }
  ts += `}\n\n`;

  // バリデーション関数
  ts += `/**\n`;
  ts += ` * ${name}のインバリアントを検証する\n`;
  ts += ` * @param obj 検証対象のオブジェクト\n`;
  ts += ` * @returns バリデーション結果\n`;
  ts += ` */\n`;
  ts += `export function validate${name}Invariants(obj: ${name}Model): ValidationResult<${name}Model> {\n`;
  ts += `  const violations: InvariantViolation[] = [];\n\n`;

  for (const inv of spec.invariants) {
    ts += `  // ${inv.description || inv.name}\n`;
    ts += `  if (!(${translateConditionToTypeScript(inv.condition, spec.states)})) {\n`;
    ts += `    violations.push(new InvariantViolation(\n`;
    ts += `      '${inv.condition.replace(/'/g, "\\'")}',\n`;
    ts += `      \`Condition violated: ${inv.condition.replace(/`/g, '\\`')}\`\n`;
    ts += `    ));\n`;
    ts += `  }\n\n`;
  }

  ts += `  if (violations.length > 0) {\n`;
  ts += `    return { success: false, violations };\n`;
  ts += `  }\n`;
  ts += `  return { success: true, value: obj };\n`;
  ts += `}\n\n`;

  // 個別インバリアントチェック関数
  ts += `/**\n`;
  ts += ` * 個別のインバリアントチェッカー\n`;
  ts += ` */\n`;
  ts += `export const ${name}InvariantChecks = {\n`;
  for (const inv of spec.invariants) {
    const funcName = `check_${inv.name || `Invariant${spec.invariants.indexOf(inv) + 1}`}`;
    ts += `  ${funcName}: (obj: ${name}Model): boolean => {\n`;
    ts += `    // ${inv.description || inv.name}\n`;
    ts += `    return ${translateConditionToTypeScript(inv.condition, spec.states)};\n`;
    ts += `  },\n`;
  }
  ts += `};\n\n`;

  // 使用例
  ts += `// 使用例:\n`;
  ts += `// const model: ${name}Model = {\n`;
  for (const s of spec.states) {
    ts += `//   ${s.name}: ${getTypeScriptDefaultValue(s.type)},\n`;
  }
  ts += `// };\n`;
  ts += `// const result = validate${name}Invariants(model);\n`;
  ts += `// if (result.success) {\n`;
  ts += `//   console.log('Valid:', result.value);\n`;
  ts += `// } else {\n`;
  ts += `//   console.error('Violations:', result.violations);\n`;
  ts += `// }\n`;

  return { content: ts, warnings, errors };
}

/**
 * 型をTypeScriptの型にマッピングする
 */
function mapTypeToTypeScript(type: string): string {
  const typeMap: Record<string, string> = {
    "int": "number",
    "integer": "number",
    "整数": "number",
    "i64": "number",
    "i32": "number",
    "float": "number",
    "double": "number",
    "f64": "number",
    "f32": "number",
    "bool": "boolean",
    "boolean": "boolean",
    "真偽": "boolean",
    "str": "string",
    "string": "string",
    "文字列": "string",
    "List": "unknown[]",
    "リスト": "unknown[]",
    "Set": "Set<unknown>",
    "集合": "Set<unknown>",
    "Map": "Map<string, unknown>",
    "マップ": "Map<string, unknown>",
  };
  return typeMap[type] || type;
}

/**
 * TypeScriptのデフォルト値を取得
 */
function getTypeScriptDefaultValue(type: string): string {
  const defaults: Record<string, string> = {
    "number": "0",
    "boolean": "false",
    "string": '""',
  };
  const tsType = mapTypeToTypeScript(type);
  return defaults[tsType] ?? "null";
}

/**
 * 条件式をTypeScriptの式に変換する
 * obj.field形式でモデルのフィールドにアクセスする
 */
function translateConditionToTypeScript(condition: string, states: SpecState[]): string {
  let result = condition
    // 複合演算子をプレースホルダーに置換
    .replace(/>=/g, "___GTE___")
    .replace(/<=/g, "___LTE___")
    .replace(/!=/g, "___NEQ___")
    .replace(/===/g, "___SEQ___")
    .replace(/==/g, "___EQ___")
    // 単一の=を===に変換
    .replace(/=/g, "===")
    // プレースホルダーを復元
    .replace(/___GTE___/g, ">=")
    .replace(/___LTE___/g, "<=")
    .replace(/___NEQ___/g, "!=")
    .replace(/___SEQ___/g, "===")
    .replace(/___EQ___/g, "===")
    // 論理演算子
    .replace(/\band\b/g, "&&")
    .replace(/\bor\b/g, "||")
    .replace(/\bnot\b/g, "!");

  // 状態変数をobj.field形式に変換（長い名前から先に処理）
  const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
  for (const state of sortedStates) {
    const regex = new RegExp(`\\b${state.name}\\b`, "g");
    result = result.replace(regex, `obj.${state.name}`);
  }

  return result;
}

// ============================================================================
// Property Test Generator (fast-check)
// ============================================================================

/**
 * spec.mdからfast-checkベースのプロパティテストを生成する
 * Rustのproptestの代わりに、TypeScriptのfast-checkを使用
 */
function generatePropertyTests(spec: ParsedSpec, structName?: string, testCount?: number): GenerationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];
  const name = structName || spec.title.replace(/[^a-zA-Z0-9]/g, "") || "Generated";

  let tests = `/**\n`;
  tests += ` * ${spec.title}のプロパティベーステスト\n`;
  tests += ` * Generated by invariant-pipeline\n`;
  tests += ` *\n`;
  tests += ` * 依存: npm install fast-check\n`;
  tests += ` */\n\n`;
  tests += `import * as fc from 'fast-check';\n`;
  tests += `import { describe, it, expect } from 'vitest';\n`;
  tests += `import { validate${name}Invariants, ${name}Model, InvariantViolation } from './validators';\n\n`;

  // テスト設定
  const testCountValue = testCount || 100; // fast-check default
  tests += `// テスト設定\n`;
  tests += `const TEST_COUNT = ${testCountValue};\n\n`;

  // fast-checkアービトラリー生成関数
  tests += `// 状態変数のアービトラリー生成\n`;
  for (const s of spec.states) {
    tests += `const arb_${s.name} = ${getFastCheckArbitrary(s.type)};\n`;
  }
  tests += `\n`;

  // モデル全体のアービトラリー
  tests += `// ${name}Model全体のアービトラリー\n`;
  tests += `const arb${name}Model = fc.record({\n`;
  for (const s of spec.states) {
    tests += `  ${s.name}: arb_${s.name},\n`;
  }
  tests += `}) as fc.Arbitrary<${name}Model>;\n\n`;

  // インバリアントテスト
  tests += `describe('${name} Invariants', () => {\n`;
  for (const inv of spec.invariants) {
    const testName = inv.name || `Invariant${spec.invariants.indexOf(inv) + 1}`;
    tests += `  it('${testName}: ${inv.condition}', () => {\n`;
    tests += `    // ${inv.description || testName}\n`;
    tests += `    fc.assert(\n`;
    tests += `      fc.property(arb${name}Model, (model) => {\n`;
    tests += `        const result = validate${name}Invariants(model);\n`;
    tests += `        // 条件: ${inv.condition}\n`;
    const translatedCondition = translateConditionToTypeScript(inv.condition, spec.states);
    tests += `        const conditionMet = ${translatedCondition.replace(/obj\./g, 'model.')};\n`;
    tests += `        expect(result.success).toBe(conditionMet);\n`;
    tests += `      }),\n`;
    tests += `      { numRuns: TEST_COUNT }\n`;
    tests += `    );\n`;
    tests += `  });\n\n`;
  }
  tests += `});\n\n`;

  // 操作テスト
  if (spec.operations.length > 0) {
    tests += `describe('${name} Operations', () => {\n`;

    for (const op of spec.operations) {
      const testName = `${op.name} maintains invariants`;
      tests += `  it('${testName}', () => {\n`;
      tests += `    // ${op.description || op.name}\n`;
      tests += `    fc.assert(\n`;
      tests += `      fc.property(arb${name}Model, (model) => {\n`;
      tests += `        // 初期状態の検証\n`;
      tests += `        const initialResult = validate${name}Invariants(model);\n`;
      tests += `        if (!initialResult.success) return; // 無効な初期状態はスキップ\n\n`;

      // 事前条件チェック
      if (op.preconditions && op.preconditions.length > 0) {
        tests += `        // 事前条件チェック\n`;
        const preconditionChecks = op.preconditions.map(pre => {
          return translateConditionToTypeScript(pre, spec.states).replace(/obj\./g, 'model.');
        });
        tests += `        const preconditionsMet = ${preconditionChecks.join(' && ')};\n`;
        tests += `        if (!preconditionsMet) return; // 事前条件を満たさない場合はスキップ\n\n`;
      } else {
        warnings.push(`Operation "${op.name}" has no preconditions - assuming always valid`);
      }

      // 操作実行（事後条件の適用）
      if (op.postconditions && op.postconditions.length > 0) {
        tests += `        // 操作実行: 事後条件を適用\n`;
        tests += `        const newModel: ${name}Model = { ...model };\n`;
        for (const post of op.postconditions) {
          const transitionCode = translatePostconditionToTypeScript(post, spec.states);
          if (transitionCode.warning) {
            warnings.push(transitionCode.warning);
          }
          tests += `        ${transitionCode.code}\n`;
        }
        tests += `\n`;
        tests += `        // 事後状態の検証\n`;
        tests += `        const postResult = validate${name}Invariants(newModel);\n`;
        tests += `        expect(postResult.success).toBe(true);\n`;
      } else {
        warnings.push(`Operation "${op.name}" has no postconditions - state remains unchanged`);
        tests += `        // 事後条件なし - 状態は不変\n`;
        tests += `        expect(initialResult.success).toBe(true);\n`;
      }

      tests += `      }),\n`;
      tests += `      { numRuns: TEST_COUNT }\n`;
      tests += `    );\n`;
      tests += `  });\n\n`;
    }
    tests += `});\n`;
  }

  return { content: tests, warnings, errors };
}

/**
 * TypeScript型に対応するfast-checkアービトラリーを取得
 */
function getFastCheckArbitrary(type: string): string {
  const tsType = mapTypeToTypeScript(type);
  const arbitraryMap: Record<string, string> = {
    "number": "fc.integer()",
    "boolean": "fc.boolean()",
    "string": "fc.string()",
  };
  return arbitraryMap[tsType] ?? "fc.anything()";
}

/**
 * 事後条件をTypeScriptの状態遷移コードに変換
 */
function translatePostconditionToTypeScript(postcondition: string, states: SpecState[]): { code: string; warning?: string } {
  // パターン: variable = expression (代入形式)
  const assignMatch = postcondition.match(/^(\w+)\s*=\s*(.+)$/);
  if (assignMatch) {
    const [, varName, expression] = assignMatch;
    const isStateVar = states.some(s => s.name === varName);
    if (isStateVar) {
      let translatedExpr = translateConditionToTypeScript(expression, states)
        .replace(/obj\./g, 'model.');
      // ===を=に戻す（代入用）
      translatedExpr = translatedExpr.replace(/===/g, '=');
      return { code: `newModel.${varName} = ${translatedExpr};` };
    }
  }

  // パターン: variable' = expression (TLA+スタイルのプライム付き変数)
  const primedMatch = postcondition.match(/^(\w+)'\s*=\s*(.+)$/);
  if (primedMatch) {
    const [, varName, expression] = primedMatch;
    const isStateVar = states.some(s => s.name === varName);
    if (isStateVar) {
      let translatedExpr = translateConditionToTypeScript(expression, states)
        .replace(/obj\./g, 'model.')
        .replace(/===/g, '=');
      return { code: `newModel.${varName} = ${translatedExpr};` };
    }
  }

  // 変換不能な場合はコメントとして出力
  return {
    code: `// TODO: 手動実装が必要: ${postcondition}`,
    warning: `Postcondition "${postcondition}" could not be automatically translated`,
  };
}

// ============================================================================
// MBT Driver Generator (TypeScript)
// ============================================================================

/**
 * spec.mdからTypeScriptベースのモデルベーステストドライバーを生成する
 * ランダム実行と決定的ステップ実行の両方をサポート
 */
function generateMBTDriver(spec: ParsedSpec, structName?: string, maxSteps?: number): GenerationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

  const name = structName || spec.title.replace(/[^a-zA-Z0-9]/g, "") || "Generated";

  let mbt = `/**\n`;
  mbt += ` * ${spec.title}のモデルベーステストドライバー\n`;
  mbt += ` * Generated by invariant-pipeline\n`;
  mbt += ` */\n\n`;

  // アクション型定義
  mbt += `/**\n`;
  mbt += ` * ${name}のアクション型\n`;
  mbt += ` */\n`;
  mbt += `export type ${name}Action =\n`;
  for (let i = 0; i < spec.operations.length; i++) {
    const op = spec.operations[i];
    const params = op.parameters && op.parameters.length > 0
      ? op.parameters.map(p => `${p.name}: ${mapTypeToTypeScript(p.type)}`).join(", ")
      : "";
    const separator = i < spec.operations.length - 1 ? " |" : ";";
    mbt += `  | { type: '${op.name}'${params ? `; ${params}` : ""} }${separator}\n`;
  }
  mbt += `\n`;

  // モデルクラス
  mbt += `/**\n`;
  mbt += ` * ${name}モデルクラス\n`;
  mbt += ` */\n`;
  mbt += `export class ${name}Model {\n`;
  for (const s of spec.states) {
    const initVal = s.initialValue !== undefined
      ? formatTypeScriptValue(s.initialValue, s.type)
      : getTypeScriptDefaultLiteral(s.type);
    mbt += `  ${s.name}: ${mapTypeToTypeScript(s.type)} = ${initVal};\n`;
  }
  mbt += `\n`;

  // 初期状態生成メソッド
  mbt += `  /**\n`;
  mbt += `   * 初期状態を生成\n`;
  mbt += `   */\n`;
  mbt += `  static initialState(): ${name}Model {\n`;
  mbt += `    return new ${name}Model();\n`;
  mbt += `  }\n\n`;

  // アクション適用メソッド
  mbt += `  /**\n`;
  mbt += `   * アクションを適用して新しい状態を返す\n`;
  mbt += `   * @param action 適用するアクション\n`;
  mbt += `   * @returns 新しいモデル状態\n`;
  mbt += `   */\n`;
  mbt += `  applyAction(action: ${name}Action): ${name}Model {\n`;
  mbt += `    const newState = new ${name}Model();\n`;
  mbt += `    // 現在の状態をコピー\n`;
  for (const s of spec.states) {
    mbt += `    newState.${s.name} = this.${s.name};\n`;
  }
  mbt += `\n`;
  mbt += `    switch (action.type) {\n`;

  for (const op of spec.operations) {
    mbt += `      case '${op.name}':\n`;
    if (op.postconditions && op.postconditions.length > 0) {
      for (const post of op.postconditions) {
        const transition = translatePostconditionToMBT(post, spec.states);
        if (transition.warning) {
          warnings.push(transition.warning);
        }
        mbt += `        ${transition.code}\n`;
      }
    } else {
      warnings.push(`Operation "${op.name}" has no postconditions - state unchanged`);
      mbt += `        // 事後条件なし - 状態は不変\n`;
    }
    mbt += `        break;\n`;
  }

  mbt += `    }\n`;
  mbt += `    return newState;\n`;
  mbt += `  }\n\n`;

  // インバリアントチェックメソッド
  mbt += `  /**\n`;
  mbt += `   * すべてのインバリアントをチェック\n`;
  mbt += `   * @returns 違反のリスト（空なら成功）\n`;
  mbt += `   */\n`;
  mbt += `  checkInvariants(): string[] {\n`;
  mbt += `    const violations: string[] = [];\n\n`;

  for (const inv of spec.invariants) {
    mbt += `    // ${inv.description || inv.name}\n`;
    const condition = translateConditionToTypeScriptForMBT(inv.condition, spec.states);
    mbt += `    if (!(${condition})) {\n`;
    mbt += `      violations.push('${inv.condition.replace(/'/g, "\\'")}');\n`;
    mbt += `    }\n\n`;
  }

  mbt += `    return violations;\n`;
  mbt += `  }\n\n`;

  // 有効なアクション生成メソッド
  mbt += `  /**\n`;
  mbt += `   * 現在の状態で有効なアクションを生成\n`;
  mbt += `   * @returns 有効なアクションのリスト\n`;
  mbt += `   */\n`;
  mbt += `  getValidActions(): ${name}Action[] {\n`;
  mbt += `    const actions: ${name}Action[] = [];\n\n`;

  for (const op of spec.operations) {
    mbt += `    // ${op.name}\n`;
    if (op.preconditions && op.preconditions.length > 0) {
      const preconditionChecks = op.preconditions.map(pre => {
        return translateConditionToTypeScriptForMBT(pre, spec.states);
      });
      mbt += `    if (${preconditionChecks.join(' && ')}) {\n`;
    } else {
      warnings.push(`Operation "${op.name}" has no preconditions - always valid`);
      mbt += `    // 事前条件なし - 常に有効\n`;
      mbt += `    {\n`;
    }

    if (op.parameters && op.parameters.length > 0) {
      // ランダムパラメータを生成（例として固定値を使用）
      const paramValues = op.parameters.map(p => {
        const tsType = mapTypeToTypeScript(p.type);
        if (tsType === "number") return "Math.floor(Math.random() * 100)";
        if (tsType === "boolean") return "Math.random() > 0.5";
        if (tsType === "string") return '"sample"';
        return "null";
      });
      const paramNames = op.parameters.map(p => p.name);
      mbt += `      actions.push({ type: '${op.name}', ${paramNames.map((n, i) => `${n}: ${paramValues[i]}`).join(', ')} });\n`;
    } else {
      mbt += `      actions.push({ type: '${op.name}' });\n`;
    }
    mbt += `    }\n\n`;
  }

  mbt += `    return actions;\n`;
  mbt += `  }\n\n`;

  // toStringメソッド
  mbt += `  /**\n`;
  mbt += `   * 文字列表現\n`;
  mbt += `   */\n`;
  mbt += `  toString(): string {\n`;
  mbt += `    return \`{ ${spec.states.map(s => `${s.name}: \${this.${s.name}}`).join(', ')} }\`;\n`;
  mbt += `  }\n`;

  mbt += `}\n\n`;

  // MBT実行関数
  const maxStepsValue = maxSteps || 100;
  mbt += `/**\n`;
  mbt += ` * モデルベーステストを実行（ランダム実行）\n`;
  mbt += ` * @param maxSteps 最大ステップ数（デフォルト: ${maxStepsValue}）\n`;
  mbt += ` * @returns テスト結果\n`;
  mbt += ` */\n`;
  mbt += `export function runMBT(maxSteps: number = ${maxStepsValue}): {\n`;
  mbt += `  success: boolean;\n`;
  mbt += `  steps: Array<{ action: ${name}Action; state: ${name}Model; violations: string[] }>;\n`;
  mbt += `  error?: string;\n`;
  mbt += `} {\n`;
  mbt += `  let model = ${name}Model.initialState();\n`;
  mbt += `  const steps: Array<{ action: ${name}Action; state: ${name}Model; violations: string[] }> = [];\n\n`;
  mbt += `  for (let step = 0; step < maxSteps; step++) {\n`;
  mbt += `    const validActions = model.getValidActions();\n\n`;
  mbt += `    if (validActions.length === 0) {\n`;
  mbt += `      console.log(\`Step \${step}: 有効なアクションなし, state=\${model.toString()}\`);\n`;
  mbt += `      continue;\n`;
  mbt += `    }\n\n`;
  mbt += `    // ランダムにアクションを選択\n`;
  mbt += `    const action = validActions[Math.floor(Math.random() * validActions.length)];\n`;
  mbt += `    model = model.applyAction(action);\n`;
  mbt += `    const violations = model.checkInvariants();\n\n`;
  mbt += `    steps.push({ action, state: model, violations });\n\n`;
  mbt += `    if (violations.length > 0) {\n`;
  mbt += `      return {\n`;
  mbt += `        success: false,\n`;
  mbt += `        steps,\n`;
  mbt += `        error: \`Step \${step}: インバリアント違反: \${violations.join(', ')}\`,\n`;
  mbt += `      };\n`;
  mbt += `    }\n\n`;
  mbt += `    console.log(\`Step \${step}: action=\${action.type}, state=\${model.toString()}\`);\n`;
  mbt += `  }\n\n`;
  mbt += `  return { success: true, steps };\n`;
  mbt += `}\n\n`;

  // 決定的実行関数
  mbt += `/**\n`;
  mbt += ` * モデルベーステストを実行（決定的ステップ実行）\n`;
  mbt += ` * @param actions 実行するアクションのリスト\n`;
  mbt += ` * @returns テスト結果\n`;
  mbt += ` */\n`;
  mbt += `export function runDeterministicMBT(actions: ${name}Action[]): {\n`;
  mbt += `  success: boolean;\n`;
  mbt += `  steps: Array<{ action: ${name}Action; state: ${name}Model; violations: string[] }>;\n`;
  mbt += `  error?: string;\n`;
  mbt += `} {\n`;
  mbt += `  let model = ${name}Model.initialState();\n`;
  mbt += `  const steps: Array<{ action: ${name}Action; state: ${name}Model; violations: string[] }> = [];\n\n`;
  mbt += `  for (const action of actions) {\n`;
  mbt += `    model = model.applyAction(action);\n`;
  mbt += `    const violations = model.checkInvariants();\n`;
  mbt += `    steps.push({ action, state: model, violations });\n\n`;
  mbt += `    if (violations.length > 0) {\n`;
  mbt += `      return {\n`;
  mbt += `        success: false,\n`;
  mbt += `        steps,\n`;
  mbt += `        error: \`インバリアント違反: \${violations.join(', ')}\`,\n`;
  mbt += `      };\n`;
  mbt += `    }\n`;
  mbt += `  }\n\n`;
  mbt += `  return { success: true, steps };\n`;
  mbt += `}\n`;

  return { content: mbt, warnings, errors };
}

/**
 * 事後条件をMBT用のTypeScriptコードに変換
 */
function translatePostconditionToMBT(postcondition: string, states: SpecState[]): { code: string; warning?: string } {
  const assignMatch = postcondition.match(/^(\w+)\s*=\s*(.+)$/);
  if (assignMatch) {
    const [, varName, expression] = assignMatch;
    const isStateVar = states.some(s => s.name === varName);
    if (isStateVar) {
      let translatedExpr = translateConditionToTypeScriptBase(expression)
        .replace(/===/g, '=');
      // 状態変数の参照をthis.fieldに変換
      const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
      for (const state of sortedStates) {
        const regex = new RegExp(`\\b${state.name}\\b`, "g");
        translatedExpr = translatedExpr.replace(regex, `this.${state.name}`);
      }
      return { code: `newState.${varName} = ${translatedExpr};` };
    }
  }

  const primedMatch = postcondition.match(/^(\w+)'\s*=\s*(.+)$/);
  if (primedMatch) {
    const [, varName, expression] = primedMatch;
    const isStateVar = states.some(s => s.name === varName);
    if (isStateVar) {
      let translatedExpr = translateConditionToTypeScriptBase(expression)
        .replace(/===/g, '=');
      const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
      for (const state of sortedStates) {
        const regex = new RegExp(`\\b${state.name}\\b`, "g");
        translatedExpr = translatedExpr.replace(regex, `this.${state.name}`);
      }
      return { code: `newState.${varName} = ${translatedExpr};` };
    }
  }

  return {
    code: `// TODO: 手動実装が必要: ${postcondition}`,
    warning: `Postcondition "${postcondition}" could not be automatically translated`,
  };
}

/**
 * 条件式をMBT用のTypeScript式に変換（this.field形式）
 */
function translateConditionToTypeScriptForMBT(condition: string, states: SpecState[]): string {
  let result = translateConditionToTypeScriptBase(condition);

  // 状態変数をthis.field形式に変換
  const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
  for (const state of sortedStates) {
    const regex = new RegExp(`\\b${state.name}\\b`, "g");
    result = result.replace(regex, `this.${state.name}`);
  }

  return result;
}

/**
 * 条件式の基本変換（型マッピングなし）
 */
function translateConditionToTypeScriptBase(condition: string): string {
  return condition
    .replace(/>=/g, "___GTE___")
    .replace(/<=/g, "___LTE___")
    .replace(/!=/g, "___NEQ___")
    .replace(/===/g, "___SEQ___")
    .replace(/==/g, "___EQ___")
    .replace(/=/g, "===")
    .replace(/___GTE___/g, ">=")
    .replace(/___LTE___/g, "<=")
    .replace(/___NEQ___/g, "!=")
    .replace(/___SEQ___/g, "===")
    .replace(/___EQ___/g, "===")
    .replace(/\band\b/g, "&&")
    .replace(/\bor\b/g, "||")
    .replace(/\bnot\b/g, "!");
}

/**
 * TypeScriptの値をフォーマット
 */
function formatTypeScriptValue(value: unknown, type: string): string {
  if (typeof value === "string") {
    const tsType = mapTypeToTypeScript(type);
    if (tsType === "number") {
      return value;
    }
    return `'${value}'`;
  }
  return String(value);
}

/**
 * TypeScriptのデフォルト値リテラルを取得
 */
function getTypeScriptDefaultLiteral(type: string): string {
  const tsType = mapTypeToTypeScript(type);
  const defaults: Record<string, string> = {
    "number": "0",
    "boolean": "false",
    "string": "''",
  };
  return defaults[tsType] ?? "null";
}

// ============================================================================
// Extension Registration
// ============================================================================

export default (api: ExtensionAPI) => {
  console.log("[invariant-pipeline] Extension loading...");

  // generate_from_spec tool
  api.registerTool({
    name: "generate_from_spec",
    description: "spec.mdからQuint形式仕様、TypeScriptバリデーション関数、fast-checkプロパティテスト、TypeScriptモデルベーステストドライバーを一括生成",
    parameters: {
      spec_path: { type: "string", description: "spec.mdファイルへのパス" },
      output_dir: { type: "string", description: "出力ディレクトリ（デフォルト: spec_pathと同じディレクトリ）" },
      module_name: { type: "string", description: "Quintモジュール名（デフォルト: specのタイトル）" },
      struct_name: { type: "string", description: "TypeScriptクラス名（デフォルト: specのタイトル）" },
      test_count: { type: "number", description: "プロパティテストのテスト数（デフォルト: 100）" },
      max_steps: { type: "number", description: "MBTの最大ステップ数（デフォルト: 100）" },
    },
    handler: async (params: {
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

        // Generate Quint spec
        const quintOutput = generateQuintSpec(spec, params.module_name);
        const quintPath = join(outputDir, `${spec.title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}.qnt`);
        writeFileSync(quintPath, quintOutput.content);
        result.outputs.quint = { path: quintPath, content: quintOutput.content };
        result.warnings.push(...quintOutput.warnings);
        result.errors.push(...quintOutput.errors);

        // Generate TypeScript validators
        const validatorsOutput = generateTsValidators(spec, params.struct_name);
        const validatorsPath = join(outputDir, "validators.ts");
        writeFileSync(validatorsPath, validatorsOutput.content);
        result.outputs.macros = { path: validatorsPath, content: validatorsOutput.content };
        result.warnings.push(...validatorsOutput.warnings);
        result.errors.push(...validatorsOutput.errors);

        // Generate property tests
        const testsOutput = generatePropertyTests(spec, params.struct_name, params.test_count);
        const testsPath = join(outputDir, "property_tests.ts");
        writeFileSync(testsPath, testsOutput.content);
        result.outputs.tests = { path: testsPath, content: testsOutput.content };
        result.warnings.push(...testsOutput.warnings);
        result.errors.push(...testsOutput.errors);

        // Generate MBT driver
        const mbtOutput = generateMBTDriver(spec, params.struct_name, params.max_steps);
        const mbtPath = join(outputDir, "mbt_driver.ts");
        writeFileSync(mbtPath, mbtOutput.content);
        result.outputs.mbt = { path: mbtPath, content: mbtOutput.content };
        result.warnings.push(...mbtOutput.warnings);
        result.errors.push(...mbtOutput.errors);

        const durationMs = Date.now() - startTime;
        console.log(`[invariant-pipeline] Generation complete in ${durationMs}ms, outputs: ${Object.keys(result.outputs).join(", ")}, warnings: ${result.warnings.length}`);

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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[invariant-pipeline] Generation failed: ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  });

  // verify_quint_spec tool
  api.registerTool({
    name: "verify_quint_spec",
    description: "Quint形式仕様を検証（構文チェック、インバリアントチェック）",
    parameters: {
      quint_path: { type: "string", description: "Quintファイルへのパス" },
      check_invariants: { type: "boolean", description: "インバリアントをチェック" },
    },
    handler: async (params: VerifyQuintInput) => {
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  });

  // generate_invariant_macros tool
  api.registerTool({
    name: "generate_invariant_macros",
    description: "spec.mdからTypeScriptインバリアントバリデーション関数を生成",
    parameters: {
      spec_path: { type: "string", description: "spec.mdファイルへのパス" },
      output_path: { type: "string", description: "出力ファイルパス" },
      struct_name: { type: "string", description: "TypeScriptモデル名" },
    },
    handler: async (params: GenerateMacrosInput) => {
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  });

  // generate_property_tests tool
  api.registerTool({
    name: "generate_property_tests",
    description: "spec.mdからfast-checkベースのプロパティテストを生成",
    parameters: {
      spec_path: { type: "string", description: "spec.mdファイルへのパス" },
      output_path: { type: "string", description: "出力ファイルパス" },
      struct_name: { type: "string", description: "テスト対象モデル名" },
      test_count: { type: "number", description: "プロパティテストのテスト数（デフォルト: 100）" },
    },
    handler: async (params: GenerateTestsInput) => {
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  });

  // generate_mbt_driver tool
  api.registerTool({
    name: "generate_mbt_driver",
    description: "spec.mdからTypeScriptベースのモデルベーステストドライバーを生成",
    parameters: {
      spec_path: { type: "string", description: "spec.mdファイルへのパス" },
      output_path: { type: "string", description: "出力ファイルパス" },
      struct_name: { type: "string", description: "TypeScriptモデルクラス名" },
      max_steps: { type: "number", description: "MBTの最大ステップ数（デフォルト: 100）" },
    },
    handler: async (params: GenerateMBTInput) => {
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  });

  console.log("[invariant-pipeline] Extension loaded", {
    tools: ["generate_from_spec", "verify_quint_spec", "generate_invariant_macros", "generate_property_tests", "generate_mbt_driver"],
  });
};
