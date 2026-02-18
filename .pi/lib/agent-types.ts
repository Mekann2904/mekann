/**
 * @abdd.meta
 * path: .pi/lib/agent-types.ts
 * role: エージェントに関する型定義と定数の共有モジュール
 * why: 重複する型定義を集約し、異なる拡張機能間での一貫性を保つため
 * related: .pi/extensions/loop.ts, .pi/extensions/rsa.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: ThinkingLevel, RunOutcomeCode, RunOutcomeSignal, DEFAULT_AGENT_TIMEOUT_MS
 * invariants: RunOutcomeCodeはいずれかの文字列リテラルに一致する、DEFAULT_AGENT_TIMEOUT_MSは10分のミリ秒数である
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: モジュール間で重複していたエージェントの型（思考レベル、実行結果コード等）と定数を定義するファイル
 * what_it_does:
 *   - モデルの推論レベルを表すThinkingLevel型を定義する
 *   - エージェントの実行結果コードRunOutcomeCodeを定義する
 *   - 実行結果コードと再試行推奨フラグを持つRunOutcomeSignalインターフェースを定義する
 *   - エージェント操作のデフォルトタイムアウト時間DEFAULT_AGENT_TIMEOUT_MSを定義する
 * why_it_exists:
 *   - loop.tsやrsa.tsなど複数のファイルで同じ型定義が重複していたため、保守性と一貫性を向上させるため
 * scope:
 *   in: なし
 * out: ThinkingLevel, RunOutcomeCode, RunOutcomeSignal, DEFAULT_AGENT_TIMEOUT_MS
 */

/**
 * Shared agent types and constants.
 * Consolidates duplicate type definitions from:
 * - .pi/extensions/loop.ts (ThinkingLevel)
 * - .pi/extensions/rsa.ts (ThinkingLevel)
 * - .pi/extensions/subagents.ts (RunOutcomeCode, RunOutcomeSignal)
 * - .pi/extensions/agent-teams.ts (RunOutcomeCode, RunOutcomeSignal)
 */

/**
 * モデルの推論レベル
 * @summary 推論レベル指定
 * @type {"off" | "minimal" | "low" | "medium" | "high" | "xhigh"}
 */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * 実行結果コード
 * @summary 実行結果コードを取得
 */
export type RunOutcomeCode =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "RETRYABLE_FAILURE"
  | "NONRETRYABLE_FAILURE"
  | "CANCELLED"
  | "TIMEOUT";

/**
 * 実行結果シグナル
 * @summary 実行結果シグナル
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
