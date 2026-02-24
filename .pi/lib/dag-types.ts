/**
 * @abdd.meta
 * path: .pi/lib/dag-types.ts
 * role: DAGベースタスク実行のための型定義
 * why: LLMCompiler統合におけるタスク計画・実行・結果の型安全性を保証するため
 * related: .pi/lib/dag-executor.ts, .pi/lib/dag-validator.ts, .pi/lib/task-dependencies.ts
 * public_api: TaskNode, TaskPlan, TaskResult, DagResult, TaskNodePriority
 * invariants: TaskPlan.tasksはDAG（循環なし）を形成する
 * side_effects: なし（型定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: 依存関係を持つタスクの計画・実行・結果を表現する型システム
 * what_it_does:
 *   - TaskNode: 個別タスクの定義（ID、説明、依存関係、担当エージェント）
 *   - TaskPlan: タスクのDAG構造とメタデータを含む実行計画
 *   - TaskResult: 個別タスクの実行結果
 *   - DagResult: DAG全体の実行結果と統計
 * why_it_exists:
 *   - タスク間の依存関係を型レベルで表現し、実行時エラーを防ぐため
 *   - LLMCompilerの概念をTypeScriptで型安全に実装するため
 * scope:
 *   in: なし
 *   out: DAG実行に関連するすべての型定義
 */

// File: .pi/lib/dag-types.ts
// Description: Type definitions for DAG-based task execution (LLMCompiler integration).
// Why: Provides type safety for task planning, execution, and result handling.
// Related: .pi/lib/dag-executor.ts, .pi/lib/dag-validator.ts, .pi/lib/task-dependencies.ts

/**
 * タスクの優先度
 * @summary タスク優先度
 */
export type TaskNodePriority = "critical" | "high" | "normal" | "low";

/**
 * タスク実行結果のステータス
 * @summary 実行ステータス
 */
export type TaskResultStatus = "completed" | "failed" | "skipped";

/**
 * DAG全体の実行ステータス
 * @summary DAG実行ステータス
 */
export type DagResultStatus = "completed" | "partial" | "failed";

/**
 * DAG内の個別タスクノード
 * @summary タスクノード定義
 * @param id - 一意なタスク識別子
 * @param description - タスクの説明（エージェントへの指示）
 * @param assignedAgent - 担当エージェントID（"researcher", "implementer"等）
 * @param dependencies - 先行タスクのID配列
 * @param priority - タスクの優先度
 * @param estimatedDurationMs - 推定実行時間（ミリ秒）
 * @param inputContext - 入力コンテキストとして注入するタスクID
 */
export interface TaskNode {
  /** 一意なタスク識別子 */
  id: string;
  /** タスクの説明（エージェントへの指示） */
  description: string;
  /** 担当エージェントID（"researcher", "implementer"等） */
  assignedAgent?: string;
  /** 先行タスクのID配列 */
  dependencies: string[];
  /** タスクの優先度 */
  priority?: TaskNodePriority;
  /** 推定実行時間（ミリ秒） */
  estimatedDurationMs?: number;
  /** 入力コンテキストとして注入するタスクID */
  inputContext?: string[];
}

/**
 * タスクの実行計画（DAG構造）
 * @summary タスク実行計画
 * @param id - プラン識別子
 * @param description - 元のタスク説明
 * @param tasks - タスクノードの配列
 * @param metadata - プランのメタデータ
 */
export interface TaskPlan {
  /** プラン識別子 */
  id: string;
  /** 元のタスク説明 */
  description: string;
  /** タスクノードの配列 */
  tasks: TaskNode[];
  /** プランのメタデータ */
  metadata: {
    /** 作成日時（UNIXタイムスタンプ） */
    createdAt: number;
    /** 使用モデル名 */
    model: string;
    /** 推定総実行時間（ミリ秒） */
    totalEstimatedMs: number;
    /** DAGの最大深さ */
    maxDepth: number;
  };
}

/**
 * 個別タスクの実行結果
 * @summary タスク実行結果
 * @param taskId - タスクID
 * @param status - 実行ステータス
 * @param output - タスクの出力（成功時）
 * @param error - エラーオブジェクト（失敗時）
 * @param durationMs - 実際の実行時間（ミリ秒）
 */
export interface DagTaskResult<T = unknown> {
  /** タスクID */
  taskId: string;
  /** 実行ステータス */
  status: TaskResultStatus;
  /** タスクの出力（成功時） */
  output?: T;
  /** エラーオブジェクト（失敗時） */
  error?: Error;
  /** 実際の実行時間（ミリ秒） */
  durationMs: number;
}

/**
 * DAG全体の実行結果
 * @summary DAG実行結果
 * @param planId - プランID
 * @param taskResults - タスクID→実行結果のマップ
 * @param overallStatus - 全体ステータス
 * @param totalDurationMs - 総実行時間（ミリ秒）
 * @param completedTaskIds - 完了したタスクID
 * @param failedTaskIds - 失敗したタスクID
 * @param skippedTaskIds - スキップされたタスクID
 */
export interface DagResult<T = unknown> {
  /** プランID */
  planId: string;
  /** タスクID→実行結果のマップ */
  taskResults: Map<string, DagTaskResult<T>>;
  /** 全体ステータス */
  overallStatus: DagResultStatus;
  /** 総実行時間（ミリ秒） */
  totalDurationMs: number;
  /** 完了したタスクID */
  completedTaskIds: string[];
  /** 失敗したタスクID */
  failedTaskIds: string[];
  /** スキップされたタスクID */
  skippedTaskIds: string[];
}

/**
 * タスクプランの作成オプション
 * @summary プラン作成オプション
 * @param id - プランID（省略時は自動生成）
 * @param model - 使用モデル名
 */
export interface CreateTaskPlanOptions {
  /** プランID（省略時は自動生成） */
  id?: string;
  /** 使用モデル名 */
  model?: string;
}

/**
 * エージェントタイプの定義
 * @summary エージェントタイプ
 */
export type AgentType = "researcher" | "implementer" | "reviewer" | "architect" | "tester";

/**
 * エージェントタイプと用途のマッピング
 * @summary エージェント用途マップ
 */
export const AGENT_TYPE_DESCRIPTIONS: Record<AgentType, string> = {
  researcher: "調査、コードベース分析、情報収集",
  implementer: "コード変更、ファイル作成、実装作業",
  reviewer: "コードレビュー、検証、品質確認",
  architect: "設計、計画策定、アーキテクチャ決定",
  tester: "テスト作成、テスト実行、品質保証",
};
