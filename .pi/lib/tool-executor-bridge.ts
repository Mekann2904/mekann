/**
 * @abdd.meta
 * path: .pi/lib/tool-executor-bridge.ts
 * role: tool-compilerとsubagent実行のブリッジモジュール
 * why: 融合操作をsubagent実行可能なフォーマットに変換し、ツール実行結果を正規化するため
 * related: .pi/lib/tool-compiler-types.ts, .pi/extensions/tool-compiler.ts, .pi/extensions/subagents/task-execution.ts
 * public_api: serializeCompilation, buildToolExecutorTask, parseToolExecutorResult
 * invariants: SerializedFusedOperationはJSONシリアライズ可能、Map/Setを含まない
 * side_effects: なし（純粋な変換関数）
 * failure_modes: JSON解析エラー時はnullを返す
 * @abdd.explain
 * overview: 融合操作のシリアライズとsubagentタスクへの変換を担う
 * what_it_does:
 *   - CompilationResultをJSON互換フォーマットにシリアライズする
 *   - subagent実行用のタスク記述を生成する
 *   - subagent出力からToolExecutorResultをパースする
 * why_it_exists:
 *   - tool-compilerとsubagentシステムの疎結合を実現するため
 *   - Map/Setを含む複雑なオブジェクトをJSON転送可能にするため
 * scope:
 *   in: CompilationResult, subagent出力文字列
 *   out: ToolExecutorTaskPayload, ToolExecutorResult
 */

// File: .pi/lib/tool-executor-bridge.ts
// Description: Bridge between tool-compiler and subagent execution
// Why: Converts fused operations to subagent-executable format

import type { CompilationResult } from "./tool-compiler-types.js";

/**
 * Subagent task payload for tool execution
 * @summary Subagentタスクペイロード
 */
export interface ToolExecutorTaskPayload {
  type: "tool-executor-bridge";
  compilationId: string;
  fusedOperations: SerializedFusedOperation[];
}

/**
 * Serializable fused operation (no Maps, Sets)
 * @summary シリアライズ可能な融合操作
 */
export interface SerializedFusedOperation {
  fusedId: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  dependsOnFusedIds: string[];
  canExecuteInParallel: boolean;
  executionStrategy: "parallel" | "sequential" | "batch";
}

/**
 * Result from tool-executor subagent
 * @summary ツール実行サブエージェントの結果
 */
export interface ToolExecutorResult {
  compilationId: string;
  success: boolean;
  toolResults: Record<string, {
    toolId: string;
    toolName: string;
    success: boolean;
    result?: unknown;
    error?: string;
    executionTimeMs: number;
  }>;
  errorSummary?: string;
}

/**
 * Convert CompilationResult to serializable format for subagent
 * @summary Compilationシリアライズ
 * @param compilation - コンパイル結果
 * @returns シリアライズされたタスクペイロード
 */
export function serializeCompilation(compilation: CompilationResult): ToolExecutorTaskPayload {
  const fusedOperations: SerializedFusedOperation[] = compilation.fusedOperations.map((op) => ({
    fusedId: op.fusedId,
    toolCalls: op.toolCalls.map((t) => ({
      id: t.id,
      name: t.name,
      arguments: t.arguments,
    })),
    dependsOnFusedIds: op.dependsOnFusedIds,
    canExecuteInParallel: op.canExecuteInParallel,
    executionStrategy: op.executionStrategy,
  }));

  return {
    type: "tool-executor-bridge",
    compilationId: compilation.compilationId,
    fusedOperations,
  };
}

/**
 * Build subagent task description from fused operations
 * @summary タスク記述ビルダー
 * @param payload - シリアライズされたタスクペイロード
 * @returns タスク記述文字列
 */
export function buildToolExecutorTask(payload: ToolExecutorTaskPayload): string {
  const opDescriptions = payload.fusedOperations.map((op) => {
    const strategy = op.executionStrategy === "parallel" ? "[PARALLEL]" : "[SEQUENTIAL]";
    const deps = op.dependsOnFusedIds.length > 0
      ? ` (depends on: ${op.dependsOnFusedIds.join(", ")})`
      : "";

    // ツール呼び出しの詳細（引数を含む）
    const toolDetails = op.toolCalls.map((t) => {
      const argsStr = Object.keys(t.arguments).length > 0
        ? JSON.stringify(t.arguments)
        : "{}";
      return `${t.name}(${argsStr})`;
    }).join(", ");

    return `${strategy} ${op.fusedId}: ${toolDetails}${deps}`;
  });

  // ツール呼び出しの完全なJSON定義
  const toolCallsJson = JSON.stringify(payload.fusedOperations.flatMap((op) => op.toolCalls), null, 2);

  return `Execute the following fused tool operations in dependency order:

Compilation ID: ${payload.compilationId}

Operations:
${opDescriptions.map((d) => `  - ${d}`).join("\n")}

Tool Calls (with arguments):
${toolCallsJson}

For each tool call:
1. Use the EXACT tool name and arguments from the JSON above
2. Execute all tools in an operation according to the strategy (parallel or sequential)
3. Record success/failure and execution time for each tool

Return format (JSON only):
{
  "compilationId": "${payload.compilationId}",
  "success": true/false,
  "toolResults": {
    "tool-id-1": { "toolId": "tool-id-1", "toolName": "name", "success": true, "result": ..., "executionTimeMs": 123 },
    "tool-id-2": { "toolId": "tool-id-2", "toolName": "name", "success": false, "error": "...", "executionTimeMs": 0 }
  }
}`;
}

/**
 * Parse subagent output back to ToolExecutorResult
 * @summary 結果パーサー
 * @param output - subagent出力文字列
 * @returns パースされた結果、または失敗時はnull
 */
export function parseToolExecutorResult(output: string): ToolExecutorResult | null {
  try {
    // Try to extract JSON from output
    const jsonMatch = output.match(/\{[\s\S]*"compilationId"[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (typeof parsed.compilationId !== "string") return null;
    if (typeof parsed.success !== "boolean") return null;
    if (typeof parsed.toolResults !== "object") return null;

    return parsed as ToolExecutorResult;
  } catch {
    return null;
  }
}
