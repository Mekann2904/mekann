/**
 * @abdd.meta
 * path: .pi/lib/invariant/application/generators/property-tests.ts
 * role: fast-checkベースのプロパティテストコードジェネレーター
 * why: ParsedSpecからプロパティベーステストを生成するため
 * related: ../domain/types.ts, ./validators.ts
 * public_api: generatePropertyTests
 * invariants: 出力は有効なTypeScript構文である
 * side_effects: なし
 * failure_modes: 不正な型や条件の場合は警告を生成
 * @abdd.explain
 * overview: ParsedSpecからfast-checkプロパティテストを生成するジェネレーター
 * what_it_does: インバリアントと操作のプロパティテストを生成する
 * why_it_exists: プロパティベーステストによる自動テスト生成を実現するため
 * scope:
 *   in: ParsedSpecオブジェクト、テスト数設定
 *   out: TypeScript形式のテストコード（文字列）
 */

import type { ParsedSpec, SpecState, GenerationOutput } from "../../domain/types.js";

/**
 * Map spec type to TypeScript type
 *
 * @summary 型をTypeScript型に変換
 * @param type - spec.mdの型名
 * @returns TypeScript型名
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
 * Get fast-check arbitrary for a type
 *
 * @summary 型に対応するfast-checkアービトラリーを取得
 * @param type - 型名
 * @returns fast-checkアービトラリー式
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
 * Translate condition to TypeScript expression
 *
 * @summary 条件式をTypeScriptの式に変換
 * @param condition - 条件式
 * @param states - 状態変数一覧
 * @returns TypeScript式
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

/**
 * Translate postcondition to TypeScript state transition code
 *
 * @summary 事後条件をTypeScriptの状態遷移コードに変換
 * @param postcondition - 事後条件
 * @param states - 状態変数一覧
 * @returns 変換結果と警告
 */
function translatePostconditionToTypeScript(
  postcondition: string,
  states: SpecState[]
): { code: string; warning?: string } {
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

/**
 * Generate property-based tests from ParsedSpec
 *
 * @summary fast-checkプロパティテストを生成
 * @param spec - パース済み仕様
 * @param structName - 構造体名（省略時はタイトルから生成）
 * @param testCount - テスト数
 * @returns 生成されたテストコード
 */
export function generatePropertyTests(
  spec: ParsedSpec,
  structName?: string,
  testCount?: number
): GenerationOutput {
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
