/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/domain/ownership.ts
 * role: ワークフロー所有権管理のドメインロジック
 * why: マルチインスタンス環境での所有権競合を防ぐため
 * related: ./workflow-state.ts
 * public_api: getInstanceId, extractPidFromInstanceId, isProcessAlive, checkOwnership
 * invariants: インスタンスIDは一意である
 * side_effects: なし（プロセス生存確認を除く）
 * failure_modes: プロセス信号送信の失敗
 * @abdd.explain
 * overview: 所有権管理の純粋関数
 * what_it_does:
 *   - インスタンスIDの生成
 *   - PID抽出とプロセス生存確認
 *   - 所有権チェック
 * why_it_exists: 複数プロセス間でのワークフロー競合を防ぐため
 * scope:
 *   in: なし
 *   out: application層
 */

import type { WorkflowState } from "./workflow-state.js";

/**
 * 所有権チェック結果
 * @summary 所有権チェック結果
 */
export interface OwnershipResult {
  /** 所有権がある場合true */
  owned: boolean;
  /** エラーメッセージ（所有権がない場合） */
  error?: string;
  /** 自動取得フラグ */
  autoClaim?: boolean;
  /** 以前の所有者ID */
  previousOwner?: string;
}

/**
 * インスタンスIDを生成
 * 形式: {sessionId}-{pid}
 * @summary ID生成
 * @returns インスタンスID文字列
 */
export function getInstanceId(): string {
  return `${process.env.PI_SESSION_ID || "default"}-${process.pid}`;
}

/**
 * インスタンスIDからPIDを抽出
 * @summary PID抽出
 * @param instanceId - インスタンスID（例: "default-34147"）
 * @returns プロセスID（抽出できない場合はnull）
 */
export function extractPidFromInstanceId(instanceId: string): number | null {
  const match = instanceId.match(/-(\d+)$/);
  if (!match) return null;
  const pid = Number(match[1]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * プロセスが生存しているかどうかを確認
 * @summary プロセス生存確認
 * @param pid - プロセスID
 * @returns プロセスが生存している場合true
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 以前の所有者のプロセスが終了しているかどうかを確認
 * @summary 古い所有者の終了確認
 * @param ownerInstanceId - 所有者のインスタンスID
 * @returns プロセスが終了している場合true
 */
export function isOwnerProcessDead(ownerInstanceId: string): boolean {
  const pid = extractPidFromInstanceId(ownerInstanceId);
  if (!pid) return false;
  return !isProcessAlive(pid);
}

/**
 * 所有権をチェック
 * @summary 所有権チェック
 * @param state - ワークフロー状態
 * @param options - オプション（autoClaim: 自動取得を許可）
 * @returns 所有権チェック結果
 */
export function checkOwnership(
  state: WorkflowState | null,
  options?: { autoClaim?: boolean }
): OwnershipResult {
  const instanceId = getInstanceId();

  if (!state) {
    return { owned: false, error: "no_active_workflow" };
  }

  if (state.ownerInstanceId !== instanceId) {
    // 所有者のプロセスが終了している場合は自動取得可能
    if (options?.autoClaim && isOwnerProcessDead(state.ownerInstanceId)) {
      return {
        owned: true,
        autoClaim: true,
        previousOwner: state.ownerInstanceId,
      };
    }
    return {
      owned: false,
      error: `workflow_owned_by_other: ${state.ownerInstanceId} (current: ${instanceId})`,
    };
  }

  return { owned: true };
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
 * 所有権を比較
 * @summary 所有権比較
 * @param state - ワークフロー状態
 * @returns 現在のインスタンスが所有者の場合true
 */
export function isCurrentOwner(state: WorkflowState): boolean {
  return state.ownerInstanceId === getInstanceId();
}
