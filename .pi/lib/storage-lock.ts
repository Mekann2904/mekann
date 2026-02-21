/**
 * @abdd.meta
 * path: .pi/lib/storage-lock.ts
 * role: 同期ファイルロックおよびアトミック書き込み機構の提供
 * why: 並列エージェント実行時におけるストレージファイルの書き込み競合とデータ破損を防ぐため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/plan.ts
 * public_api: FileLockOptions, tryAcquireLock, clearStaleLock, sleepSync
 * invariants: ロックファイルにはPIDとタイムスタンプが含まれる、ビジーウェイトは発生しない
 * side_effects: ファイルシステムへのロックファイル作成、更新、削除
 * failure_modes: SharedArrayBuffer未対応環境では診断情報付きエラー、ロック取得タイムアウト、EEXISTエラーによる取得失敗
 * @abdd.explain
 * overview: Node.jsのfsモジュールを用いた同期排他制御ライブラリ
 * what_it_does:
 *   - Atomics.waitを用いた同期スリープの提供（利用可能な場合）
 *   - 排他的フラグ（wx）を用いたロックファイルのアトミックな作成
 *   - 経過時間に基づく陳腐化したロックファイルの自動削除
 * why_it_exists:
 *   - マルチプロセス環境での同時書き込みによるレコードの破壊を回避する必要性
 *   - プロセスが異常終了した際のロック解放（stale lock）を取り扱う必要性
 * scope:
 *   in: FileLockOptions, ロックファイルパス, 対象ファイルパス
 *   out: ロック取得成否, スリープ成否, ファイルシステム状態の変更
 */

// File: .pi/lib/storage-lock.ts
// Description: Provides synchronous file lock and atomic write helpers for extension storage files.
// Why: Prevents concurrent storage writes from clobbering records during parallel agent executions.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/plan.ts

import { randomBytes } from "node:crypto";
import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

/**
 * @summary ロック設定群
 * @description ファイルロックの動作オプション
 * @property {number} maxWaitMs - 最大待機時間
 * @property {number} pollMs - ポーリング間隔
 * @property {number} staleMs - ステイル検出時間
 */
export interface FileLockOptions {
  maxWaitMs?: number;
  pollMs?: number;
  staleMs?: number;
}

const DEFAULT_LOCK_OPTIONS: Required<FileLockOptions> = {
  maxWaitMs: 4_000,
  pollMs: 25,
  staleMs: 30_000,
};

let atomicWriteCounter = 0;

/**
 * Check if efficient synchronous sleep is available.
 * SharedArrayBuffer + Atomics.wait is required for non-blocking sleep.
 */
function hasEfficientSyncSleep(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof Atomics !== "undefined" &&
    typeof Atomics.wait === "function"
  );
}

/**
 * Synchronous sleep using Atomics.wait on SharedArrayBuffer.
 * Returns true if sleep was successful, false if efficient sleep is unavailable.
 * WARNING: Never uses busy-wait to avoid CPU spin.
 * @param ms - ミリ秒単位の待機時間
 * @returns {boolean} スリープ成功時true、失敗時false
 */
function sleepSync(ms: number): boolean {
  if (ms <= 0) return true;

  if (!hasEfficientSyncSleep()) {
    // SharedArrayBuffer not available (browser env, Node.js without --experimental-shared-memory, etc.)
    // Do NOT busy-wait. Return false to indicate sleep was not performed.
    // Caller should handle this case (e.g., use reduced retry count or fail with clear message).
    return false;
  }

  try {
    const sab = new SharedArrayBuffer(4);
    const view = new Int32Array(sab);
    Atomics.wait(view, 0, 0, ms);
    return true;
  } catch {
    // SharedArrayBuffer creation failed (e.g., security restrictions, COOP/COEP headers missing)
    // Do NOT busy-wait. Return false.
    return false;
  }
}

/**
 * SharedArrayBuffer利用可否の詳細情報を取得
 * @summary 環境診断情報を返す
 * @returns {object} 診断情報
 */
export function getSyncSleepDiagnostics(): {
  hasSharedArrayBuffer: boolean;
  hasAtomics: boolean;
  hasAtomicsWait: boolean;
  isAvailable: boolean;
  reason: string;
} {
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
  const hasAtomics = typeof Atomics !== "undefined";
  const hasAtomicsWait = hasAtomics && typeof Atomics.wait === "function";
  const isAvailable = hasSharedArrayBuffer && hasAtomicsWait;

  let reason: string;
  if (!hasSharedArrayBuffer) {
    reason =
      "SharedArrayBuffer is not defined. This environment does not support synchronous sleep. " +
      "In Node.js, ensure no --no-experimental-shared-memory flag is used. " +
      "In browsers, COOP/COEP headers are required.";
  } else if (!hasAtomics) {
    reason = "Atomics is not defined despite SharedArrayBuffer being available.";
  } else if (!hasAtomicsWait) {
    reason = "Atomics.wait is not available (possibly a Worker context without support).";
  } else {
    reason = "Synchronous sleep is available.";
  }

  return {
    hasSharedArrayBuffer,
    hasAtomics,
    hasAtomicsWait,
    isAvailable,
    reason,
  };
}

function isNodeErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

function tryAcquireLock(lockFile: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(lockFile, "wx", 0o600);
    writeFileSync(fd, `${process.pid}:${Date.now()}\n`, "utf-8");
    return true;
  } catch (error) {
    if (isNodeErrno(error, "EEXIST")) {
      return false;
    }
    throw error;
  } finally {
    if (typeof fd === "number") {
      try {
        closeSync(fd);
      } catch {
        // noop
      }
    }
  }
}

function clearStaleLock(lockFile: string, staleMs: number): void {
  const isLockOwnerDead = (): boolean => {
    try {
      const raw = readFileSync(lockFile, "utf-8").trim();
      const [pidText] = raw.split(":", 1);
      const pid = Number(pidText);
      if (!Number.isInteger(pid) || pid <= 0) return false;
      try {
        process.kill(pid, 0);
        return false;
      } catch (error) {
        return isNodeErrno(error, "ESRCH");
      }
    } catch {
      return false;
    }
  };

  try {
    const ageMs = Date.now() - statSync(lockFile).mtimeMs;
    if (ageMs > staleMs || isLockOwnerDead()) {
      unlinkSync(lockFile);
    }
  } catch {
    // noop
  }
}

/**
 * @summary ロック取得実行
 * @param targetFile - ロック対象ファイル
 * @param fn - 実行する関数
 * @param options - ロックオプション
 * @returns {T} 関数の実行結果
 * @throws ロック取得失敗時
 */
export function withFileLock<T>(
  targetFile: string,
  fn: () => T,
  options?: FileLockOptions,
): T {
  const lockFile = `${targetFile}.lock`;
  const config = {
    ...DEFAULT_LOCK_OPTIONS,
    ...(options || {}),
  };
  const maxWaitMs = Math.max(0, Math.trunc(config.maxWaitMs));
  const pollMs = Math.max(1, Math.trunc(config.pollMs));
  const requestedStaleMs = Math.max(1_000, Math.trunc(config.staleMs));
  // Ensure stale cleanup has a chance to run before timeout.
  const staleMs = maxWaitMs > 0 ? Math.min(requestedStaleMs, maxWaitMs) : requestedStaleMs;
  const maxAttempts = Math.max(1, Math.ceil(maxWaitMs / pollMs) + 1);
  let attempts = 0;
  let acquired = false;
  const canSleep = hasEfficientSyncSleep();

  while (!acquired && attempts < maxAttempts) {
    attempts++;
    acquired = tryAcquireLock(lockFile);
    if (acquired) break;
    clearStaleLock(lockFile, staleMs);

    // If efficient sleep is unavailable, do one last immediate retry then exit.
    // This avoids a tight spin loop in environments without SharedArrayBuffer.
    if (!canSleep) {
      acquired = tryAcquireLock(lockFile);
      if (acquired) break;
      break;
    }

    const sleepOk = sleepSync(pollMs);
    if (!sleepOk) {
      // Sleep failed unexpectedly, break to avoid potential spin
      break;
    }
  }

  if (!acquired) {
    const diag = getSyncSleepDiagnostics();
    const envHint = !diag.isAvailable
      ? ` (環境問題: ${diag.reason})`
      : "";
    throw new Error(
      `file lock timeout: ${lockFile}${envHint} (attempts=${attempts}, maxWaitMs=${maxWaitMs})`,
    );
  }

  try {
    return fn();
  } finally {
    try {
      unlinkSync(lockFile);
    } catch {
      // noop
    }
  }
}

/**
 * @summary テキスト書込
 * @param filePath - ファイルパス
 * @param content - 書き込む内容
 * @returns {void}
 */
export function atomicWriteTextFile(filePath: string, content: string): void {
  atomicWriteCounter = (atomicWriteCounter + 1) >>> 0;
  const tmpFile = `${filePath}.tmp-${process.pid}-${randomBytes(3).toString("hex")}-${atomicWriteCounter}`;
  writeFileSync(tmpFile, content, "utf-8");
  try {
    renameSync(tmpFile, filePath);
  } catch (error) {
    try {
      unlinkSync(tmpFile);
    } catch {
      // noop
    }
    throw error;
  }
}
