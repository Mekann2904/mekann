/**
 * @abdd.meta
 * path: .pi/lib/subagents/domain/ownership.ts
 * role: UL Workflow所有権チェックのドメインロジック
 * why: サブエージェント実行時の所有権検証を行うため
 * related: ./subagent-definition.ts
 * public_api: UlWorkflowOwnershipResult, checkUlWorkflowOwnership
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: UL Workflow所有権の純粋関数
 * what_it_does:
 *   - 所有権の検証
 *   - プロセス生存確認
 * why_it_exists: マルチインスタンス環境での競合を防ぐため
 * scope:
 *   in: なし
 *   out: application層
 */

/**
 * UL Workflow所有権チェック結果
 * @summary 所有権チェック結果
 */
export interface UlWorkflowOwnershipResult {
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
 * インスタンスIDを取得
 * 形式: {sessionId}-{pid}
 * @summary ID取得
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
 * UL Workflowの所有権をチェック
 * サブエージェント実行前に呼び出され、ulTaskIdパラメータで指定された
 * ワークフローの所有権を確認する
 * @summary 所有権チェック
 * @param taskId - タスクID
 * @param loadState - 状態読み込み関数
 * @returns 所有権チェック結果
 */
export function checkUlWorkflowOwnership(
  taskId: string,
  loadState: (taskId: string) => { ownerInstanceId: string } | null
): UlWorkflowOwnershipResult {
  const state = loadState(taskId);

  if (!state) {
    return { owned: false, error: "task_not_found" };
  }

  const instanceId = getInstanceId();

  if (state.ownerInstanceId !== instanceId) {
    // 所有者のプロセスが終了している場合は自動取得可能
    if (isOwnerProcessDead(state.ownerInstanceId)) {
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
