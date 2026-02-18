/**
 * @abdd.meta
 * path: .pi/lib/agent-types.ts
 * role: 共有型定義ライブラリ
 * why: 複数のエージェント拡張機能間で重複していた型定義を一元管理し、保守性を向上させるため
 * related: .pi/extensions/loop.ts, .pi/extensions/rsa.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: ThinkingLevel, RunOutcomeCode, RunOutcomeSignal, DEFAULT_AGENT_TIMEOUT_MS
 * invariants: ThinkingLevelは定義された7種類の文字列リテラルのみ、RunOutcomeCodeは6種類の文字列リテラルのみ、DEFAULT_AGENT_TIMEOUT_MSは正の整数(600000)
 * side_effects: なし（純粋な型定義と定数のエクスポートのみ）
 * failure_modes: なし（型定義ファイルのため実行時エラーは発生しない）
 * @abdd.explain
 * overview: エージェント関連の型と定数を集約した共有型定義ファイル
 * what_it_does:
 *   - モデル推論レベルを表すThinkingLevel型（7段階）を定義
 *   - エージェント実行結果コードRunOutcomeCode型（6種類）を定義
 *   - 実行結果シグナルRunOutcomeSignalインターフェース（outcomeCodeとretryRecommended）を定義
 *   - デフォルトタイムアウト値DEFAULT_AGENT_TIMEOUT_MS（10分=600000ms）を定義
 * why_it_exists:
 *   - loop.ts、rsa.ts、subagents.ts、agent-teams.tsで重複定義されていた型を統合
 *   - 型定義の変更を一箇所で管理可能にする
 *   - 拡張機能間での型整合性を保証
 * scope:
 *   in: なし
 *   out: エージェント拡張機能全般で使用される共有型
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
