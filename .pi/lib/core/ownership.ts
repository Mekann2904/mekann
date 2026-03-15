/**
 * @abdd.meta
 * path: .pi/lib/core/ownership.ts
 * role: クロスインスタンス所有権管理の共通ユーティリティ
 * why: 複数のモジュール（UL Workflow、Subagents、Long-Running）で一貫した所有権管理を提供するため
 * related: .pi/lib/ul-workflow/domain/ownership.ts, .pi/lib/subagents/domain/ownership.ts, .pi/lib/long-running-supervisor.ts
 * public_api: getInstanceId, extractPidFromInstanceId, extractTokenFromInstanceId, isProcessAlive, isOwnerProcessDead, checkOwnership, isCurrentOwner, resetInstanceIdCache, OwnershipResult
 * invariants: インスタンスIDは一意であり、{sessionId}-{pid}-{token}形式を遵循する。トークンは8文字の16進数
 * side_effects: なし（プロセス生存確認を除く）
 * failure_modes: プロセス信号送信の失敗
 * @abdd.explain
 * overview: すべてのフローで使用する統一された所有権管理ユーティリティ
 * what_it_does:
 *   - インスタンスIDの生成と解析
 *   - プロセス生存確認
 *   - 所有権チェック
 *   - キャッシュリセット（テスト用）
 * why_it_exists: 複数モジュールでの重複実装を防ぎ、一貫性を保証するため
 * scope:
 *   in: なし
 *   out: UL Workflow, Subagents, Long-Running Session, Workspace Verification
 */

import { randomUUID } from "crypto";

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
 * 現在のプロセスのインスタンスID（キャッシュ用）
 * 一度生成したら同一プロセス内では固定
 */
let _cachedInstanceId: string | undefined;

/**
 * インスタンスIDキャッシュをリセット（テスト用）
 * @summary キャッシュリセット
 */
export function resetInstanceIdCache(): void {
  _cachedInstanceId = undefined;
}

/**
 * 8文字のランダムトークンを生成
 * PID再利用攻撃を防ぐためのセッショントークン
 */
function generateSessionToken(): string {
  return randomUUID().slice(0, 8);
}

/**
 * インスタンスIDを生成・取得
 * 形式: {sessionId}-{pid}-{token}
 * tokenはPID再利用攻撃を防ぐためのセッショントークン
 * @summary ID生成
 * @returns インスタンスID文字列
 */
export function getInstanceId(): string {
  if (!_cachedInstanceId) {
    const sessionId = process.env.PI_SESSION_ID || "default";
    const token = generateSessionToken();
    _cachedInstanceId = `${sessionId}-${process.pid}-${token}`;
  }
  return _cachedInstanceId;
}

/**
 * インスタンスIDからPIDを抽出
 * @summary PID抽出
 * @param instanceId - インスタンスID（例: "default-34147-a1b2c3d4"）
 * @returns プロセスID（抽出できない場合はnull）
 */
export function extractPidFromInstanceId(instanceId: string): number | null {
  if (!instanceId || typeof instanceId !== "string") return null;

  // 新形式: {sessionId}-{pid}-{token}
  const matchNew = instanceId.match(/-(\d+)-[a-f0-9]{8}$/);
  if (matchNew) {
    const pid = Number(matchNew[1]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }
  // 旧形式: {sessionId}-{pid}（後方互換性）
  const matchOld = instanceId.match(/-(\d+)$/);
  if (!matchOld) return null;
  const pid = Number(matchOld[1]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * インスタンスIDからトークンを抽出
 * @summary トークン抽出
 * @param instanceId - インスタンスID
 * @returns セッショントークン（抽出できない場合はnull）
 */
export function extractTokenFromInstanceId(instanceId: string): string | null {
  if (!instanceId || typeof instanceId !== "string") return null;
  const match = instanceId.match(/-([a-f0-9]{8})$/);
  return match ? match[1] : null;
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
 * PID再利用攻撃を防ぐため、トークン比較も行う
 * @summary 古い所有者の終了確認
 * @param ownerInstanceId - 所有者のインスタンスID
 * @returns プロセスが終了している場合true
 */
export function isOwnerProcessDead(ownerInstanceId: string): boolean {
  const pid = extractPidFromInstanceId(ownerInstanceId);
  if (!pid) return false;

  // プロセスが存在しない場合は終了と判定
  if (!isProcessAlive(pid)) {
    return true;
  }

  // プロセスが存在する場合、トークンを確認
  // トークンが異なる場合は、PIDが再利用された別のプロセス
  const ownerToken = extractTokenFromInstanceId(ownerInstanceId);
  const currentToken = extractTokenFromInstanceId(getInstanceId());

  // 所有者IDにトークンがない（旧形式）または、
  // 現在のインスタンスIDにトークンがない場合は、
  // 安全側に倒してPIDのみで判定
  if (!ownerToken || !currentToken) {
    return false;
  }

  // トークンが異なる場合は、PIDが再利用されたと判定
  // ただし、同じインスタンスの場合はトークンも同じなので「死んでいない」
  if (ownerInstanceId === getInstanceId()) {
    return false;
  }

  // PIDが存在するが、トークンが異なる = PID再利用
  // 元のプロセスは終了していると判定
  return true;
}

/**
 * 所有権をチェック（汎用）
 * @summary 所有権チェック
 * @param ownerInstanceId - 現在の所有者インスタンスID
 * @param options - オプション（autoClaim: 自動取得を許可）
 * @returns 所有権チェック結果
 */
export function checkOwnership(
  ownerInstanceId: string | undefined | null,
  options?: { autoClaim?: boolean }
): OwnershipResult {
  const instanceId = getInstanceId();

  if (!ownerInstanceId) {
    return { owned: false, error: "no_owner" };
  }

  if (ownerInstanceId !== instanceId) {
    // 所有者のプロセスが終了している場合は自動取得可能
    if (options?.autoClaim && isOwnerProcessDead(ownerInstanceId)) {
      return {
        owned: true,
        autoClaim: true,
        previousOwner: ownerInstanceId,
      };
    }
    return {
      owned: false,
      error: `owned_by_other: ${ownerInstanceId} (current: ${instanceId})`,
    };
  }

  return { owned: true };
}

/**
 * 所有権を比較
 * @summary 所有権比較
 * @param ownerInstanceId - 所有者インスタンスID
 * @returns 現在のインスタンスが所有者の場合true
 */
export function isCurrentOwner(ownerInstanceId: string | undefined | null): boolean {
  return ownerInstanceId === getInstanceId();
}
