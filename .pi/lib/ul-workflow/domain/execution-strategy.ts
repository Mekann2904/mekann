/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/domain/execution-strategy.ts
 * role: 統一実行フローの定義
 * why: 実際の UL workflow 実装と同じフェーズ列を domain 層でも共有するため
 * related: ./workflow-state.ts
 * public_api: UNIFIED_PHASES, UNIFIED_EXECUTION_CONFIG
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 統一実行フロー定数
 * what_it_does:
 *   - 統一フェーズ構成を定義
 *   - 常にDAG並列実行を使用
 *   - implement 後に review フェーズを必ず挟む
 * why_it_exists: 複雑度ベースの条件分岐を廃止し、一貫したフローを提供しつつ、verify 導線を落とさない
 * scope:
 *   in: なし
 *   out: application層、adapters層
 */

import type { WorkflowPhase } from "./workflow-state.js";

/**
 * 統一フェーズ構成
 * @summary 統一フェーズ
 * @description すべてのタスクで適用される統一フロー
 * - Research (DAG並列): コードベースの深い理解
 * - Plan: 詳細な実装計画の作成
 * - Annotate: ユーザーによる計画レビュー（必須）
 * - Implement (DAG並列): 計画に基づく実装
 * - Review: verify と品質確認
 * - Completed: 完了
 */
export const UNIFIED_PHASES: WorkflowPhase[] = [
  "research",
  "plan",
  "annotate",
  "implement",
  "review",
  "completed",
];

/**
 * 統一実行設定
 * @summary 実行設定
 */
export interface UnifiedExecutionConfig {
  /** 常にDAG並列実行を使用 */
  readonly useDag: true;
  /** Research/Implementフェーズの最大並列数 */
  readonly maxConcurrency: number;
  /** 人間によるplan確認が必須 */
  readonly requireHumanApproval: true;
}

/**
 * デフォルト実行設定
 * @summary デフォルト設定
 */
export const DEFAULT_EXECUTION_CONFIG: UnifiedExecutionConfig = {
  useDag: true,
  maxConcurrency: 3,
  requireHumanApproval: true,
} as const;

/**
 * 統一フェーズを取得
 * @summary フェーズ取得
 * @returns 統一フェーズ配列
 */
export function getUnifiedPhases(): WorkflowPhase[] {
  return [...UNIFIED_PHASES];
}

/**
 * 統一実行設定を取得
 * @summary 設定取得
 * @param overrideMaxConcurrency - 最大並列数のオーバーライド（省略時はデフォルト）
 * @returns 実行設定
 */
export function getExecutionConfig(overrideMaxConcurrency?: number): UnifiedExecutionConfig {
  if (overrideMaxConcurrency !== undefined) {
    return {
      useDag: true,
      maxConcurrency: overrideMaxConcurrency,
      requireHumanApproval: true,
    };
  }
  return DEFAULT_EXECUTION_CONFIG;
}

// =============================================================================
// 以下は後方互換性のためのdeprecatedエクスポート
// =============================================================================

/**
 * @deprecated 統一フローを使用してください。getUnifiedPhases()を使用してください。
 * @summary フェーズ取得（非推奨）
 */
export function determineWorkflowPhases(_task: string): WorkflowPhase[] {
  return getUnifiedPhases();
}

/**
 * @deprecated 統一フローを使用してください。getExecutionConfig()を使用してください。
 * @summary 実行戦略（非推奨）
 */
export type ExecutionStrategy = "simple" | "dag" | "full-workflow";

/**
 * @deprecated 統一フローを使用してください。
 */
export type TaskComplexity = "low" | "medium" | "high";

/**
 * @deprecated 統一フローを使用してください。getExecutionConfig()を使用してください。
 */
export interface ExecutionStrategyResult {
  strategy: ExecutionStrategy;
  phases: WorkflowPhase[];
  useDag: boolean;
  reason: string;
}

/**
 * @deprecated 統一フローを使用してください。
 */
export function estimateTaskComplexity(_task: string): TaskComplexity {
  return "medium";
}

/**
 * @deprecated 統一フローでは使用しません。
 */
export function looksLikeClearGoalTask(_task: string): boolean {
  return false;
}

/**
 * @deprecated 統一フローを使用してください。getExecutionConfig()を使用してください。
 */
export function determineExecutionStrategy(_task: string): ExecutionStrategyResult {
  return {
    strategy: "dag",
    phases: getUnifiedPhases(),
    useDag: true,
    reason: "Unified flow - always DAG-based parallel execution",
  };
}
