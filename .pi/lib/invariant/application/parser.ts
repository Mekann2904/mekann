/**
 * @abdd.meta
 * path: .pi/lib/invariant/application/parser.ts
 * role: spec.mdファイルのパーサー
 * why: 自然言語仕様書を構造化データに変換し、コード生成を可能にするため
 * related: ../domain/types.ts, ./generators/*.ts
 * public_api: parseSpecMarkdown
 * invariants: 入力は有効なMarkdown文字列である
 * side_effects: なし
 * failure_modes: 不正なMarkdown形式の場合は部分的なパース結果を返す
 * @abdd.explain
 * overview: Markdown形式の仕様書をParsedSpecオブジェクトに変換するパーサー
 * what_it_does: セクション、状態、操作、インバリアント、定数を抽出し構造化する
 * why_it_exists: 自然言語仕様とコード生成の間のギャップを埋めるため
 * scope:
 *   in: Markdownテキスト（spec.mdの内容）
 *   out: ParsedSpecオブジェクト
 */

import type { ParsedSpec, SpecState, SpecOperation } from "../domain/types.js";

/**
 * Parse spec.md content into structured ParsedSpec
 *
 * @summary spec.mdを構造化データに変換
 * @param content - Markdown形式の仕様書内容
 * @returns パース済みの仕様オブジェクト
 */
export function parseSpecMarkdown(content: string): ParsedSpec {
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
        spec.constants.push(currentConstant);
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
          spec.constants.push(currentConstant);
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
    spec.constants.push(currentConstant);
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
 *
 * @summary 型に基づいて定数値をパース
 * @param valueStr - 値の文字列表現
 * @param type - 値の型
 * @returns パースされた値
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
