/**
 * @abdd.meta
 * path: .pi/lib/storage-lock.ts
 * role: 同期ファイルロックおよびアトミック書き込み機構の提供
 * why: 並列エージェント実行時におけるストレージファイルの書き込み競合とデータ破損を防ぐため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/plan.ts
 * public_api: FileLockOptions, tryAcquireLock, clearStaleLock, sleepSync
 * invariants: ロックファイルにはPIDとタイムスタンプが含まれる、ビジーウェイトは発生しない
 * side_effects: ファイルシステムへのロックファイル作成、更新、削除
 * failure_modes: SharedArrayBuffer未対応環境での即時リターン、ロック取得タイムアウト、EEXISTエラーによる取得失敗
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
 */
function sleepSync(ms: number): boolean {
  if (ms <= 0) return true;

  if (!hasEfficientSyncSleep()) {
    // Do NOT busy-wait. Return false to indicate sleep was not performed.
    // Caller should handle this case (e.g., retry immediately or fail).
    return false;
  }

  try {
    const sab = new SharedArrayBuffer(4);
    const view = new Int32Array(sab);
    Atomics.wait(view, 0, 0, ms);
    return true;
  } catch {
    // SharedArrayBuffer creation failed (e.g., security restrictions)
    // Do NOT busy-wait. Return false.
    return false;
  }
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
  try {
/**
     * /**
     * * ファイルロックを取得して関数を実行する
     * *
     * * 指定されたファイルに対してロックを取得し、ロック保持中に渡された関数を実行します。
     * * 関数の実行完了後、ロックは自動的に解放されます。
     * *
     * * @param targetFile
     */
    const ageMs = Date.now() - statSync(lockFile).mtimeMs;
    if (ageMs > staleMs) {
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
  const staleMs = Math.max(1_000, Math.trunc(config.staleMs));
  const startedAtMs = Date.now();
  let acquired = false;
  const canSleep = hasEfficientSyncSleep();

  while (!acquired && Date.now() - startedAtMs <= maxWaitMs) {
    acquired = tryAcquireLock(lockFile);
    if (acquired) break;
    clearStaleLock(lockFile, staleMs);

    // If efficient sleep is unavailable, exit early to avoid CPU spin.
    // This provides a graceful degradation path for environments without SharedArrayBuffer.
    if (!canSleep) {
      // Check if we've exceeded max wait time or should fail fast
      const elapsedMs = Date.now() - startedAtMs;
      if (elapsedMs >= maxWaitMs) {
        break;
      }
      // Allow one immediate retry without sleep, then fail fast
      // to prevent tight spin loops in constrained environments.
      if (elapsedMs > 100) {
        console.warn(
          `[storage-lock] SharedArrayBuffer unavailable, failing fast after ${elapsedMs}ms to avoid CPU spin`
        );
        break;
      }
      // Immediate retry for the first ~100ms as a grace period
      continue;
    }

    const sleepOk = sleepSync(pollMs);
    if (!sleepOk) {
      // Sleep failed unexpectedly, break to avoid potential spin
      break;
    }
  }

  if (!acquired) {
    throw new Error(`file lock timeout: ${lockFile}`);
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
  const tmpFile = `${filePath}.tmp-${process.pid}-${randomBytes(3).toString("hex")}`;
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
