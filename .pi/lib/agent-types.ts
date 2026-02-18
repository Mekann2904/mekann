/**
 * Shared agent types and constants.
 * Consolidates duplicate type definitions from:
 * - .pi/extensions/loop.ts (ThinkingLevel)
 * - .pi/extensions/rsa.ts (ThinkingLevel)
 * - .pi/extensions/subagents.ts (RunOutcomeCode, RunOutcomeSignal)
 * - .pi/extensions/agent-teams.ts (RunOutcomeCode, RunOutcomeSignal)
 */

 /**
  * モデルの推論レベルを表す型。
  */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

 /**
  * エージェントの実行結果コード
  */
export type RunOutcomeCode =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "RETRYABLE_FAILURE"
  | "NONRETRYABLE_FAILURE"
  | "CANCELLED"
  | "TIMEOUT";

 /**
  * 実行結果を表すシグナル
  * @param outcomeCode 実行結果コード
  * @param retryRecommended 再試行推奨フラグ
  */
export interface RunOutcomeSignal {
  outcomeCode: RunOutcomeCode;
  retryRecommended: boolean;
}

/**
 * Default timeout for agent operations in milliseconds.
 * 10 minutes - conservative default for complex operations.
 */
export const DEFAULT_AGENT_TIMEOUT_MS = 10 * 60 * 1000;
