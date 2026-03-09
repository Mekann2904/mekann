/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/domain/ownership.ts
 * role: ワークフロー所有権管理のドメインロジック
 * why: マルチインスタンス環境での所有権競合を防ぐため
 * related: ./workflow-state.ts, ../../core/ownership.ts
 * public_api: checkOwnership, claimOwnership, isCurrentOwner, getInstanceId, extractPidFromInstanceId, isProcessAlive, isOwnerProcessDead, OwnershipResult
 * invariants: インスタンスIDは一意である
 * side_effects: なし（プロセス生存確認を除く）
 * failure_modes: プロセス信号送信の失敗
 * @abdd.explain
 * overview: ワークフロー所有権管理の純粋関数
 * what_it_does:
 *   - WorkflowState用の所有権チェック
 *   - 所有権の主張と比較
 *   - コア所有権ユーティリティの再エクスポート
 * why_it_exists: 複数プロセス間でのワークフロー競合を防ぐため
 * scope:
 *   in: なし
 *   out: application層
 */

import type { WorkflowState } from "./workflow-state.js";

// 基本ユーティリティを共通モジュールから再エクスポート
export {
  getInstanceId,
  extractPidFromInstanceId,
  isProcessAlive,
  isOwnerProcessDead,
  resetInstanceIdCache,
  type OwnershipResult,
} from "../../core/ownership.js";

import { checkOwnership as checkOwnershipCore, getInstanceId } from "../../core/ownership.js";
import type { OwnershipResult } from "../../core/ownership.js";

/**
 * 所有権をチェック（WorkflowState用）
 * @summary 所有権チェック
 * @param state - ワークフロー状態
 * @param options - オプション（autoClaim: 自動取得を許可）
 * @returns 所有権チェック結果
 */
export function checkOwnership(
  state: WorkflowState | null,
  options?: { autoClaim?: boolean }
): OwnershipResult {
  if (!state) {
    return { owned: false, error: "no_active_workflow" };
  }

  const result = checkOwnershipCore(state.ownerInstanceId, options);
  
  // エラーメッセージをワークフロー用に調整
  if (!result.owned && result.error?.startsWith("owned_by_other")) {
    return {
      ...result,
      error: `workflow_owned_by_other: ${state.ownerInstanceId}`,
    };
  }
  
  return result;
}

/**
 * 所有権を主張（状態の更新は呼び出し元の責任）
 * @summary 所有権主張
 * @param state - ワークフロー状態
 * @returns 新しい所有者ID
 */
export function claimOwnership(state: WorkflowState): string {
  const instanceId = getInstanceId();
  state.ownerInstanceId = instanceId;
  state.updatedAt = new Date().toISOString();
  return instanceId;
}

/**
 * 所有権を比較（WorkflowState用）
 * @summary 所有権比較
 * @param state - ワークフロー状態
 * @returns 現在のインスタンスが所有者の場合true
 */
export function isCurrentOwner(state: WorkflowState): boolean {
  return state.ownerInstanceId === getInstanceId();
}
