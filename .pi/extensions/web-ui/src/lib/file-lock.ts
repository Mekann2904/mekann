/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/lib/file-lock.ts
 * @role ファイルロックによる並行制御
 * @why 複数プロセスからの同時書き込みを防止
 * @related lib/storage.ts
 * @public_api FileLock
 * @invariants ロック取得中は他プロセスは待機
 * @side_effects ロックファイルの作成・削除
 * @failure_modes ロック取得タイムアウト
 *
 * @abdd.explain
 * @overview シンプルなファイルベースのロック機構
 * @what_it_does 排他制御によるデータ整合性の確保
 * @why_it_exists JSONファイルの同時書き込みによるデータ破損を防止
 * @scope(in) ターゲットファイルパス
 * @scope(out) ロックファイル
 */

import { writeFileSync, existsSync, unlinkSync, readFileSync } from "fs";
import { dirname, join } from "path";

/**
 * ファイルロック設定
 */
interface FileLockConfig {
  /** ロック取得の最大試行回数 */
  maxAttempts: number;
  /** 試行間隔（ミリ秒） */
  retryIntervalMs: number;
  /** ロックタイムアウト（ミリ秒）- これを過ぎたロックは無効とみなす */
  lockTimeoutMs: number;
}

const DEFAULT_CONFIG: FileLockConfig = {
  maxAttempts: 10,
  retryIntervalMs: 50,
  lockTimeoutMs: 30000, // 30秒
};

/**
 * ファイルロッククラス
 * 
 * @example
 * ```ts
 * const lock = new FileLock("/path/to/data.json");
 * lock.withLock(() => {
 *   // 排他制御が必要な処理
 * });
 * ```
 */
export class FileLock {
  private readonly lockPath: string;
  private readonly config: FileLockConfig;
  private locked = false;

  constructor(targetPath: string, config?: Partial<FileLockConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    const dir = dirname(targetPath);
    this.lockPath = join(dir, `.${basename(targetPath)}.lock`);
  }

  /**
   * ロックを取得
   * @returns 取得に成功した場合はtrue
   */
  acquire(): boolean {
    // 既存のロックがタイムアウトしていないか確認
    if (existsSync(this.lockPath)) {
      if (this.isLockStale()) {
        this.forceRelease();
      } else {
        return false;
      }
    }

    try {
      // 排他作成（wx フラグ）
      writeFileSync(this.lockPath, JSON.stringify({
        pid: process.pid,
        timestamp: Date.now(),
      }), { flag: "wx" });
      this.locked = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ロックを解放
   */
  release(): void {
    if (this.locked) {
      try {
        unlinkSync(this.lockPath);
      } catch {
        // 既に削除されている場合は無視
      }
      this.locked = false;
    }
  }

  /**
   * ロックを取得して関数を実行
   * @param fn 実行する関数
   * @returns 関数の戻り値
   */
  withLock<T>(fn: () => T): T {
    // リトライ付きでロック取得
    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      if (this.acquire()) {
        try {
          return fn();
        } finally {
          this.release();
        }
      }

      if (attempt < this.config.maxAttempts - 1) {
        this.sleep(this.config.retryIntervalMs);
      }
    }

    // ロック取得失敗時は警告して処理続行
    console.warn(`[file-lock] Could not acquire lock after ${this.config.maxAttempts} attempts: ${this.lockPath}`);
    return fn();
  }

  /**
   * 非同期版のロック付き実行
   */
  async withLockAsync<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      if (this.acquire()) {
        try {
          return await fn();
        } finally {
          this.release();
        }
      }

      if (attempt < this.config.maxAttempts - 1) {
        await this.sleepAsync(this.config.retryIntervalMs);
      }
    }

    console.warn(`[file-lock] Could not acquire lock after ${this.config.maxAttempts} attempts: ${this.lockPath}`);
    return fn();
  }

  /**
   * ロックがタイムアウトしているか確認
   */
  private isLockStale(): boolean {
    try {
      const content = readFileSync(this.lockPath, "utf-8");
      const { timestamp } = JSON.parse(content);
      return Date.now() - timestamp > this.config.lockTimeoutMs;
    } catch {
      return true; // 読み取り失敗はタイムアウト扱い
    }
  }

  /**
   * 強制的にロックを解放
   */
  private forceRelease(): void {
    try {
      unlinkSync(this.lockPath);
    } catch {
      // 無視
    }
  }

  /**
   * 同期スリープ
   */
  private sleep(ms: number): void {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // busy wait（短時間なので許容）
    }
  }

  /**
   * 非同期スリープ
   */
  private sleepAsync(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * パスからファイル名を抽出（node:pathのbasenameと同等）
 */
function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || "";
}
