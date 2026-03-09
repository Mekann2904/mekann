/**
 * @abdd.meta
 * path: .pi/lib/subagents/domain/ownership.ts
 * role: サブエージェント用UL Workflow所有権チェックのドメインロジック
 * why: サブエージェント実行時の所有権検証を行うため
 * related: ./subagent-definition.ts, ../../core/ownership.ts
 * public_api: checkUlWorkflowOwnership, needsOwnershipCheck, formatOwnershipError, getInstanceId, extractPidFromInstanceId, isProcessAlive, isOwnerProcessDead, OwnershipResult
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: サブエージェント用所有権チェックの純粋関数
 * what_it_does:
 *   - UL Workflowの所有権検証
 *   - 所有権チェック要否の判定
 *   - エラーメッセージ生成
 *   - コア所有権ユーティリティの再エクスポート
 * why_it_exists: マルチインスタンス環境でのサブエージェント実行競合を防ぐため
 * scope:
 *   in: なし
 *   out: application層
 */

// 基本ユーティリティを共通モジュールから再エクスポート
export {
  getInstanceId,
  extractPidFromInstanceId,
  isProcessAlive,
  isOwnerProcessDead,
  resetInstanceIdCache,
  type OwnershipResult,
} from "../../core/ownership.js";

import { checkOwnership as checkOwnershipCore, type OwnershipResult } from "../../core/ownership.js";

/**
 * UL Workflow所有権チェック結果
 * @summary 所有権チェック結果
 * @deprecated OwnershipResultを使用してください
 */
export type UlWorkflowOwnershipResult = OwnershipResult;

/**
 * UL Workflowの所有権をチェック
 * サブエージェント実行前に呼び出され、ulTaskIdパラメータで指定された
 * ワークフローの所有権を確認する
 * @summary 所有権チェック
 * @param taskId - タスクID
 * @param loadState - 状態読み込み関数
 * @param options - オプション（autoClaim: 自動取得を許可、デフォルトtrue）
 * @returns 所有権チェック結果
 */
export function checkUlWorkflowOwnership(
  taskId: string,
  loadState: (taskId: string) => { ownerInstanceId: string } | null,
  options?: { autoClaim?: boolean }
): UlWorkflowOwnershipResult {
  const state = loadState(taskId);

  if (!state) {
    return { owned: false, error: "task_not_found" };
  }

  // デフォルトでautoClaim: true（孤児タスク回復を許可）
  const result = checkOwnershipCore(state.ownerInstanceId, { autoClaim: options?.autoClaim ?? true });
  
  // エラーメッセージを調整
  if (!result.owned && result.error?.startsWith("owned_by_other")) {
    return {
      ...result,
      error: `workflow_owned_by_other: ${state.ownerInstanceId}`,
    };
  }
  
  return result;
}

/**
 * サブエージェント実行が所有権チェックを必要とするかどうか
 * @summary 所有権チェック要否
 * @param ulTaskId - UL WorkflowタスクID（オプション）
 * @returns チェックが必要な場合true
 */
export function needsOwnershipCheck(ulTaskId?: string): boolean {
  return ulTaskId !== undefined && ulTaskId !== null && ulTaskId !== "";
}

/**
 * 所有権エラーメッセージを生成
 * @summary エラーメッセージ生成
 * @param result - 所有権チェック結果
 * @returns エラーメッセージ
 */
export function formatOwnershipError(result: UlWorkflowOwnershipResult): string {
  if (result.owned) {
    return "";
  }

  switch (result.error) {
    case "task_not_found":
      return "指定されたタスクが見つかりません";
    case result.error?.startsWith("workflow_owned_by_other"):
      return `このワークフローは他のインスタンスが所有しています。\n所有者: ${result.previousOwner || "unknown"}`;
    default:
      return result.error || "不明な所有権エラー";
  }
}
