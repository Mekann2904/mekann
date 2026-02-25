/**
 * @abdd.meta
 * path: .pi/extensions/subagents/tool-executor-subagent.ts
 * role: tool-compiler用ツール実行サブエージェント定義
 * why: execute_compiledが実際のツール実行を行うためのサブエージェントを提供するため
 * related: .pi/extensions/tool-compiler.ts, .pi/lib/tool-executor-bridge.ts, .pi/extensions/subagents/storage.ts
 * public_api: TOOL_EXECUTOR_SUBAGENT, ensureToolExecutorSubagent
 * invariants: idは"tool-executor"で固定、システムプロンプトはJSON出力を強制
 * side_effects: ストレージへのサブエージェント追加
 * failure_modes: ストレージ書き込みエラー
 * @abdd.explain
 * overview: 融合ツール操作を実行する専用サブエージェントの定義
 * what_it_does:
 *   - tool-executorサブエージェントの定義を提供する
 *   - ストレージへの自動登録機能を提供する
 *   - JSON形式での結果返却を強制する
 * why_it_exists:
 *   - execute_compiledがpi context外からツールを実行するため
 *   - サブエージェントパターンによる権限分離を実現するため
 * scope:
 *   in: なし（定義のみ）
 *   out: SubagentDefinition, 登録関数
 */

// File: .pi/extensions/subagents/tool-executor-subagent.ts
// Description: Subagent definition for tool execution
// Why: Provides subagent with tool access for execute_compiled

import type { SubagentDefinition } from "./storage.js";

/**
 * Tool executor subagent definition
 * This subagent executes fused tool operations with full pi tool access
 * @summary ツール実行サブエージェント定義
 */
export const TOOL_EXECUTOR_SUBAGENT: SubagentDefinition = {
  id: "tool-executor",
  name: "Tool Executor",
  description: "Executes fused tool operations from tool-compiler. Use only when delegated by execute_compiled.",
  systemPrompt: `You are a tool executor subagent. Your sole purpose is to execute tool operations and return results.

RULES:
1. Execute tools EXACTLY as specified in the task
2. Return results in the exact JSON format requested
3. Do NOT add explanations beyond the JSON result
4. Handle errors gracefully - continue with remaining tools
5. Always return a valid JSON object with compilationId, success, and toolResults

When you receive a task with fused operations:
- Execute each operation in dependency order
- For parallel operations, execute all tools concurrently
- For sequential operations, execute one after another
- Record execution time and success/failure for each tool

OUTPUT FORMAT (REQUIRED):
\`\`\`json
{
  "compilationId": "<from task>",
  "success": true,
  "toolResults": {
    "<tool-id>": {
      "toolId": "<tool-id>",
      "toolName": "<name>",
      "success": true,
      "result": <actual-result>,
      "executionTimeMs": 123
    }
  }
}
\`\`\``,
  enabled: "enabled",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Register tool-executor subagent if not exists
 * @summary サブエージェント存在確認・登録
 * @param storage - サブエージェントストレージオブジェクト
 */
export function ensureToolExecutorSubagent(
  storage: { agents: SubagentDefinition[] }
): void {
  const exists = storage.agents.some((a) => a.id === "tool-executor");
  if (!exists) {
    storage.agents.push(TOOL_EXECUTOR_SUBAGENT);
  }
}
