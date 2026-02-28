/**
 * @abdd.meta
 * path: .pi/lib/agent-types.ts
 * role: エージェントシステムにおける共有型定義と定数の管理
 * why: 異なる拡張機能間で重複していた型定義を統一し、保守性と一貫性を確保するため
 * related: .pi/extensions/loop.ts, .pi/extensions/rsa.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: ThinkingLevel, RunOutcomeCode, RunOutcomeSignal, DEFAULT_AGENT_TIMEOUT_MS
 * invariants: RunOutcomeCodeは定義された6つのリテラル文字列のいずれかである、RunOutcomeSignalのretryRecommendedはoutcomeCodeに基づくブール値である
 * side_effects: なし（純粋な型定数と型定義）
 * failure_modes: なし
 * @abdd.explain
 * overview: エージェントの実行制御や結果判定に必要な列挙型、インターフェース、定数を集約した定義ファイル
 * what_it_does:
 *   - 推論レベル（ThinkingLevel）を表す型を定義する
 *   - 実行結果のステータス（RunOutcomeCode）と構造化されたシグナル（RunOutcomeSignal）の型を定義する
 *   - エージェント操作のデフォルトタイムアウト時間（10分）を定数として提供する
 * why_it_exists:
 *   - .pi/extensions配下の複数のモジュールで重複していた定義を一箇所にまとめるため
 *   - 型の変更を一元化し、将来的なバグのリスクを減らすため
 * scope:
 *   in: 外部モジュールからのインポートなし
 *   out: ループ処理、RSA認証、サブエージェント、エージェントチーム機能への型エクスポート
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
