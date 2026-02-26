/**
 * @abdd.meta
 * path: .pi/lib/self-revision.ts
 * role: DAG実行中の動的更新と自己修正
 * why: 実行結果に基づいてDAGを動的に更新し、失敗からの回復力を高める
 * related: .pi/lib/dag-executor.ts, .pi/lib/task-dependencies.ts, .pi/lib/dag-types.ts
 * public_api: SelfRevisionModule, RevisionResult, RevisionAction
 * invariants: 更新後もDAGの整合性（非循環性）を維持する
 * side_effects: DAGの動的変更
 * failure_modes: 循環依存の形成、存在しないノードへの参照
 * @abdd.explain
 * overview: TDP論文のSelf-Revisionコンポーネントを実装し、バッチ実行後にDAGを評価・更新する
 * what_it_does:
 *   - 完了ノードの結果がDAGの前提と矛盾していないかチェック
 *   - 失敗ノードの依存先ノードの仕様を修正
 *   - 必要に応じてノードを追加/削除
 *   - 新しい制約情報を下流ノードに伝播
 * why_it_exists:
 *   - 静的なDAGでは対処できない実行時の問題に対応するため
 *   - エラーの局所化と伝播防止を実現するため
 */

import type { TaskNode, DagTaskResult } from "./dag-types.js";

/**
 * 修正アクションの種類
 * @summary リビジョンアクション型
 */
export type RevisionAction =
  | { type: "add_node"; node: TaskNode }
  | { type: "remove_node"; nodeId: string }
  | { type: "update_spec"; nodeId: string; newDescription: string }
  | { type: "add_dependency"; taskId: string; dependencyId: string }
  | { type: "remove_dependency"; taskId: string; dependencyId: string }
  | { type: "no_change" };

/**
 * 修正結果
 * @summary リビジョン結果
 */
export interface RevisionResult {
  /** 実行されたアクション */
  actions: RevisionAction[];
  /** 修正理由 */
  reason: string;
  /** 修正後も実行可能か */
  feasible: boolean;
}

/**
 * Self-Revision モジュールのインターフェース
 * @summary リビジョンモジュールインターフェース
 */
export interface RevisionExecutor {
  addDependency(taskId: string, dependencyId: string): void;
  removeDependency(taskId: string, dependencyId: string): boolean;
  getTask(taskId: string): TaskNode | undefined;
  detectCycle(): { hasCycle: boolean; cyclePath: string[] | null };
}

/**
 * Self-Revision モジュール
 * @summary 自己修正モジュール
 * @example
 * const revision = new SelfRevisionModule(executor);
 * const result = await revision.revise(completedIds, failedIds, results);
 * if (!result.feasible) {
 *   console.warn("DAG became infeasible");
 * }
 */
export class SelfRevisionModule {
  private executor: RevisionExecutor;

  constructor(executor: RevisionExecutor) {
    this.executor = executor;
  }

  /**
   * バッチ完了後にDAGを評価・更新
   * TDP Algorithm 1: Self-Revision step
   * @summary DAG評価・更新
   * @param completedTaskIds - 完了したタスクID
   * @param failedTaskIds - 失敗したタスクID
   * @param results - タスク結果マップ
   * @returns リビジョン結果
   */
  async revise(
    completedTaskIds: string[],
    failedTaskIds: string[],
    results: Map<string, DagTaskResult>,
  ): Promise<RevisionResult> {
    const actions: RevisionAction[] = [];

    // 1. 失敗ノードの分析
    for (const failedId of failedTaskIds) {
      const result = results.get(failedId);
      if (!result) continue;

      const recoveryActions = this.analyzeFailure(failedId, result);
      actions.push(...recoveryActions);
    }

    // 2. 完了ノードの前提チェック
    for (const completedId of completedTaskIds) {
      const result = results.get(completedId);
      if (!result || result.status !== "completed") continue;

      const constraintActions = this.checkConstraintViolations(completedId, result);
      actions.push(...constraintActions);
    }

    // 3. 新しい情報の下流伝播
    const propagationActions = this.propagateConstraints(completedTaskIds, results);
    actions.push(...propagationActions);

    // 4. アクションを適用
    for (const action of actions) {
      this.applyAction(action);
    }

    // 5. 循環検出
    const cycleCheck = this.executor.detectCycle();

    return {
      actions,
      reason:
        actions.length > 0
          ? `Applied ${actions.length} revision(s)`
          : "No revisions needed",
      feasible: !cycleCheck.hasCycle,
    };
  }

  /**
   * 失敗を分析してリカバリーアクションを生成
   * @summary 失敗分析
   * @param failedId - 失敗タスクID
   * @param result - タスク結果
   * @returns リカバリーアクション
   */
  private analyzeFailure(failedId: string, result: DagTaskResult): RevisionAction[] {
    const actions: RevisionAction[] = [];
    const errorMsg = result.error?.message || "";

    // エラーパターンに基づく分類
    if (errorMsg.includes("not found") || errorMsg.includes("does not exist")) {
      // リソース不在: 依存関係を追加して事前準備が必要
      actions.push({
        type: "add_node",
        node: {
          id: `${failedId}-prereq`,
          description: `Prepare resources for ${failedId}`,
          dependencies: [],
          assignedAgent: "implementer",
          priority: "critical",
        },
      });
      actions.push({
        type: "add_dependency",
        taskId: failedId,
        dependencyId: `${failedId}-prereq`,
      });
    } else if (
      errorMsg.includes("permission") ||
      errorMsg.includes("access denied")
    ) {
      // 権限エラー: 仕様を更新して回避策を追加
      const task = this.executor.getTask(failedId);
      if (task) {
        actions.push({
          type: "update_spec",
          nodeId: failedId,
          newDescription: `${task.description}\n\nNOTE: Permission error detected. Try alternative approach.`,
        });
      }
    }

    return actions;
  }

  /**
   * 制約違反をチェック
   * @summary 制約違反チェック
   * @param completedId - 完了タスクID
   * @param result - タスク結果
   * @returns 制約違反アクション
   */
  private checkConstraintViolations(
    completedId: string,
    result: DagTaskResult,
  ): RevisionAction[] {
    // 完了ノードの結果が下流の前提と矛盾していないかチェック
    // 現状は簡易実装: 出力に "ERROR" や "FAILED" が含まれる場合
    const output =
      typeof result.output === "string"
        ? result.output
        : JSON.stringify(result.output);

    if (output.includes("ERROR") || output.includes("FAILED")) {
      // 下流ノードに警告を追加
      return [
        {
          type: "update_spec",
          nodeId: completedId,
          newDescription: `WARNING: Upstream task ${completedId} reported issues. Verify results.`,
        },
      ];
    }

    return [];
  }

  /**
   * 制約情報を下流に伝播
   * @summary 制約伝播
   * @param completedTaskIds - 完了タスクID
   * @param results - タスク結果
   * @returns 伝播アクション
   */
  private propagateConstraints(
    completedTaskIds: string[],
    results: Map<string, DagTaskResult>,
  ): RevisionAction[] {
    // 新しく判明した制約を下流ノードの仕様に反映
    // 現状は簡易実装
    void completedTaskIds;
    void results;
    return [];
  }

  /**
   * アクションを適用
   * @summary アクション適用
   * @param action - 適用するアクション
   */
  private applyAction(action: RevisionAction): void {
    switch (action.type) {
      case "add_dependency":
        try {
          this.executor.addDependency(action.taskId, action.dependencyId);
        } catch {
          // 依存関係の追加に失敗した場合は無視
        }
        break;

      case "remove_dependency":
        this.executor.removeDependency(action.taskId, action.dependencyId);
        break;

      case "update_spec":
        const task = this.executor.getTask(action.nodeId);
        if (task) {
          task.description = action.newDescription;
        }
        break;

      case "add_node":
      case "remove_node":
        // DagExecutorにはノード追加APIがないため、
        // 必要に応じて拡張が必要
        break;
    }
  }
}
