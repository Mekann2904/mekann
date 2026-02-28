/**
 * @abdd.meta
 * path: .pi/lib/invariant/application/generators/mbt-driver.ts
 * role: TypeScriptモデルベーステストドライバーコードジェネレーター
 * why: ParsedSpecからモデルベーステストのドライバーコードを生成するため
 * related: ../domain/types.ts, ./validators.ts
 * public_api: generateMBTDriver
 * invariants: 出力は有効なTypeScript構文である
 * side_effects: なし
 * failure_modes: 不正な型や条件の場合は警告を生成
 * @abdd.explain
 * overview: ParsedSpecからモデルベーステストドライバーを生成するジェネレーター
 * what_it_does: モデルクラス、アクション型、MBT実行関数を生成する
 * why_it_exists: モデルベーステストによるステートフルなテストを自動生成するため
 * scope:
 *   in: ParsedSpecオブジェクト、最大ステップ数設定
 *   out: TypeScript形式のMBTドライバーコード（文字列）
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
 * Translate condition to TypeScript base expression
 *
 * @summary 条件式の基本変換
 * @param condition - 条件式
 * @returns 変換された式
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
 * Translate condition to TypeScript for MBT
 *
 * @summary 条件式をMBT用のTypeScript式に変換
 * @param condition - 条件式
 * @param states - 状態変数一覧
 * @returns TypeScript式
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
 * Translate postcondition to MBT TypeScript code
 *
 * @summary 事後条件をMBT用のTypeScriptコードに変換
 * @param postcondition - 事後条件
 * @param states - 状態変数一覧
 * @returns 変換結果と警告
 */
function translatePostconditionToMBT(
  postcondition: string,
  states: SpecState[]
): { code: string; warning?: string } {
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
 * Format TypeScript value
 *
 * @summary TypeScriptの値をフォーマット
 * @param value - 値
 * @param type - 型名
 * @returns フォーマットされた文字列
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
 * Get TypeScript default value literal
 *
 * @summary TypeScriptのデフォルト値リテラルを取得
 * @param type - 型名
 * @returns デフォルト値リテラル
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

/**
 * Generate MBT driver from ParsedSpec
 *
 * @summary モデルベーステストドライバーを生成
 * @param spec - パース済み仕様
 * @param structName - 構造体名（省略時はタイトルから生成）
 * @param maxSteps - 最大ステップ数
 * @returns 生成されたMBTドライバーコード
 */
export function generateMBTDriver(
  spec: ParsedSpec,
  structName?: string,
  maxSteps?: number
): GenerationOutput {
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
