/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/domain/workflow-state.ts
 * role: ワークフロー状態のドメイン型定義
 * why: UL Workflowの状態とフェーズを型安全に管理するため
 * related: ./ownership.ts, ./execution-strategy.ts
 * public_api: WorkflowPhase, WorkflowState, ActiveWorkflowRegistry
 * invariants: フェーズは定義された順序で遷移する
 * side_effects: なし（純粋な型定義）
 * failure_modes: なし
 * @abdd.explain
 * overview: UL Workflowのドメインモデル定義
 * what_it_does:
 *   - ワークフローフェーズの型定義
 *   - ワークフロー状態の型定義
 *   - アクティブワークフローレジストリの型定義
 * why_it_exists: 状態管理の一貫性と型安全性を保証するため
 * scope:
 *   in: なし
 *   out: application層、adapters層
 */

/**
 * ワークフローのフェーズ
 * @summary ワークフローフェーズ
 */
export type WorkflowPhase =
  | "idle"
  | "research"
  | "plan"
  | "annotate"
  | "implement"
  | "review"
  | "completed"
  | "aborted";

/**
 * ワークフロー状態
 * @summary ワークフロー状態
 */
export interface WorkflowState {
  /** タスクID */
  taskId: string;
  /** タスク説明 */
  taskDescription: string;
  /** 現在のフェーズ */
  phase: WorkflowPhase;
  /** 動的に決定されたフェーズ一覧 */
  phases: WorkflowPhase[];
  /** 現在のフェーズインデックス */
  phaseIndex: number;
  /** 作成日時 (ISO 8601) */
  createdAt: string;
  /** 更新日時 (ISO 8601) */
  updatedAt: string;
  /** 承認済みフェーズ */
  approvedPhases: string[];
  /** 注釈数 */
  annotationCount: number;
  /** 所有者インスタンスID ({sessionId}-{pid}形式) */
  ownerInstanceId: string;
}

/**
 * アクティブワークフローレジストリ
 * @summary マルチインスタンス調整用レジストリ
 */
export interface ActiveWorkflowRegistry {
  /** アクティブなタスクID */
  activeTaskId: string | null;
  /** 所有者インスタンスID */
  ownerInstanceId: string | null;
  /** 更新日時 (ISO 8601) */
  updatedAt: string;
}

/**
 * デフォルトのフェーズ構成
 * @summary 標準フェーズ
 */
export const DEFAULT_PHASES: WorkflowPhase[] = [
  "research",
  "plan",
  "annotate",
  "implement",
  "completed",
];

/**
 * フェーズを進める（純粋関数）
 * @summary フェーズ進行
 * @param state - 現在の状態
 * @returns 新しいフェーズ
 */
export function advancePhase(state: WorkflowState): WorkflowPhase {
  if (state.phaseIndex < state.phases.length - 1) {
    return state.phases[state.phaseIndex + 1];
  }
  return state.phase;
}

/**
 * 次のフェーズインデックスを取得
 * @summary 次インデックス取得
 * @param state - 現在の状態
 * @returns 次のインデックス（最後の場合は現在の値）
 */
export function getNextPhaseIndex(state: WorkflowState): number {
  if (state.phaseIndex < state.phases.length - 1) {
    return state.phaseIndex + 1;
  }
  return state.phaseIndex;
}

/**
 * ワークフローが終了状態かどうか
 * @summary 終了状態判定
 * @param phase - フェーズ
 * @returns 終了状態の場合true
 */
export function isTerminalPhase(phase: WorkflowPhase): boolean {
  return phase === "completed" || phase === "aborted";
}

/**
 * フェーズが実行可能かどうか
 * @summary 実行可能判定
 * @param state - ワークフロー状態
 * @returns 実行可能な場合true
 */
export function canExecutePhase(state: WorkflowState): boolean {
  return !isTerminalPhase(state.phase) && state.phase !== "idle";
}

/**
 * フェーズの説明を取得
 * @summary フェーズ説明取得
 * @param phase - フェーズ
 * @returns 日本語の説明
 */
export function getPhaseDescription(phase: WorkflowPhase): string {
  const descriptions: Record<WorkflowPhase, string> = {
    idle: "待機中",
    research: "調査フェーズ - コードベースの深い理解",
    plan: "計画フェーズ - 詳細な実装計画の作成",
    annotate: "注釈フェーズ - ユーザーによる計画のレビューと修正",
    implement: "実装フェーズ - 計画に基づくコード実装",
    review: "レビューフェーズ - 実装の品質確認",
    completed: "完了",
    aborted: "中止",
  };
  return descriptions[phase];
}
