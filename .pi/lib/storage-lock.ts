/**
 * @abdd.meta
 * path: .pi/lib/storage-lock.ts
 * role: 同期ファイルロックおよび原子書き込みヘルパーの提供
 * why: 並行するエージェント実行中にストレージファイルへの競合書き込みを防止する
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/plan.ts
 * public_api: FileLockOptions
 * invariants:
 *   - ロックファイルは排他モード(wx)で作成され、存在時はEEXISTで失敗する
 *   - ロックファイルにはPIDとタイムスタンプが記録される
 *   - busy-waitを使用せず、CPUスピンを回避する
 * side_effects:
 *   - ロックファイルの作成・削除
 *   - ファイルシステムへの読み書き
 * failure_modes:
 *   - EEXIST: ロックファイルが既に存在し取得不可
 *   - SharedArrayBuffer不可: 効率的な同期スリープが利用できない環境
 *   - ファイルシステムエラー: 権限不足やディスクフル
 * @abdd.explain
 * overview: 拡張機能ストレージファイル向けの同期ファイルロック機構を提供するユーティリティ
 * what_it_does:
 *   - 排他ロックファイルをwxモードで作成し、PIDとタイムスタンプを書き込む
 *   - 期限切れロック（staleMs経過）を検出して削除する
 *   - SharedArrayBuffer+Atomics.waitによるブロッキングなしの同期スリープを実装
 *   - ロック取得失敗時は即座にfalseを返しbusy-waitを回避
 * why_it_exists:
 *   - 複数エージェントの並行実行時のデータ破損を防止
 *   - ストレージ操作の原子性を保証
 *   - Node.js同期APIのみでロック機構を実現
 * scope:
 *   in: ターゲットファイルパス、ロックオプション（maxWaitMs, pollMs, staleMs）
 *   out: ロック取得成功/失敗の真偽値、ロックファイルの作成/削除
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
  * ファイルロックのオプション設定
  * @param maxWaitMs - ロック取得の最大待機時間（ミリ秒）
  * @param pollMs - ロック確認のポーリング間隔（ミリ秒）
  * @param staleMs - ロックの有効期限（ミリ秒）
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
  * ファイルロックを取得して関数を実行
  * @param targetFile ロック対象のファイルパス
  * @param fn 実行する関数
  * @param options ロックのオプション
  * @returns 関数の実行結果
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
 * テキストファイルをアトミックに書き込む
 * @param filePath 書き込み先のファイルパス
 * @param content 書き込む内容
 * @returns なし
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
