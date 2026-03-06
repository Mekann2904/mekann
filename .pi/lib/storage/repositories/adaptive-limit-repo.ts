/**
 * @abdd.meta
 * path: .pi/lib/storage/repositories/adaptive-limit-repo.ts
 * role: 適応的レート制限情報の永続化を管理するリポジトリ
 * why: adaptive-rate-controller.tsのデータアクセスを抽象化し、SQLiteへの移行を容易にするため
 * related: .pi/lib/storage/sqlite-db.ts, .pi/lib/adaptive-rate-controller.ts
 * public_api: AdaptiveLimitRepository, createAdaptiveLimitRepository
 * invariants: トランザクション内でのみ書き込み、JSONフィールドは正しくシリアライズ
 * side_effects: データベースへの読み書き
 * failure_modes: データベース接続エラー、JSONパースエラー
 * @abdd.explain
 * overview: 適応的レート制限情報のCRUD操作を提供するリポジトリパターンの実装
 * what_it_does:
 *   - プロバイダ/モデルごとの制限値の登録・更新
 *   - 429エラーと成功の記録
 *   - 回復スケジュールの管理
 * why_it_exists:
 *   - データアクセスロジックをビジネスロジックから分離するため
 *   - 将来的なストレージ変更を容易にするため
 * scope:
 *   in: LearnedLimit型のデータ
 *   out: データベース操作の結果
 */

import type { PiDatabase } from "../sqlite-db.js";
import { safeParseJson, safeStringifyJson, timestampNow } from "../sqlite-schema.js";
import type { LearnedLimit } from "../../adaptive-rate-controller.js";

// 遅延初期化用
let getDatabaseImpl: (() => PiDatabase) | null = null;

/**
 * プロバイダとモデルの複合キー
 */
export type ProviderModelKey = `${string}:${string}`;

/**
 * データベース行の型定義
 */
interface AdaptiveLimitRow {
  provider_model: string;
  concurrency: number;
  original_concurrency: number;
  last_429_at: string | null;
  consecutive_429_count: number;
  total_429_count: number;
  last_success_at: string | null;
  recovery_scheduled: number;
  historical_429s_json: string;
  predicted_429_probability: number;
  ramp_up_schedule_json: string;
  notes: string | null;
}

const SQLITE_BUSY_RETRY_COUNT = 5;
const SQLITE_BUSY_RETRY_BASE_MS = 25;

function isBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("database is locked") || error.message.includes("SQLITE_BUSY");
}

function sleepSync(ms: number): void {
  try {
    const buffer = new SharedArrayBuffer(4);
    const view = new Int32Array(buffer);
    Atomics.wait(view, 0, 0, ms);
  } catch {
    // Atomics.wait が使えない環境では待機を諦める
  }
}

/**
 * 適応的レート制限リポジトリ
 * @summary 適応的制限情報の永続化を管理
 */
export class AdaptiveLimitRepository {
  private readonly db: PiDatabase;

  // プリペアドステートメント（キャッシュ用）
  private stmtUpsert: import("better-sqlite3").Statement | null = null;
  private stmtGetByKey: import("better-sqlite3").Statement | null = null;
  private stmtGetAll: import("better-sqlite3").Statement | null = null;
  private stmtDelete: import("better-sqlite3").Statement | null = null;
  private stmtRecord429: import("better-sqlite3").Statement | null = null;
  private stmtRecordSuccess: import("better-sqlite3").Statement | null = null;

  constructor(db: PiDatabase) {
    this.db = db;
  }

  private runWithBusyRetry<T>(fn: () => T): T {
    let lastError: unknown;

    for (let attempt = 0; attempt < SQLITE_BUSY_RETRY_COUNT; attempt++) {
      try {
        return fn();
      } catch (error) {
        if (!isBusyError(error) || attempt === SQLITE_BUSY_RETRY_COUNT - 1) {
          throw error;
        }

        lastError = error;
        sleepSync(SQLITE_BUSY_RETRY_BASE_MS * (attempt + 1));
      }
    }

    throw lastError instanceof Error ? lastError : new Error("database is locked");
  }

  /**
   * 制限値を登録または更新（upsert）
   * @summary 制限値登録
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param limit - 制限値情報
   */
  upsert(provider: string, model: string, limit: LearnedLimit): void {
    const stmt = this.getStmtUpsert();
    const key = this.makeKey(provider, model);
    this.runWithBusyRetry(() => {
      stmt.run({
        provider_model: key,
        concurrency: limit.concurrency,
        original_concurrency: limit.originalConcurrency,
        last_429_at: limit.last429At,
        consecutive_429_count: limit.consecutive429Count,
        total_429_count: limit.total429Count,
        last_success_at: limit.lastSuccessAt,
        recovery_scheduled: limit.recoveryScheduled ? 1 : 0,
        historical_429s_json: safeStringifyJson(limit.historical429s ?? []),
        predicted_429_probability: limit.predicted429Probability ?? 0,
        ramp_up_schedule_json: safeStringifyJson(limit.rampUpSchedule ?? []),
        notes: limit.notes ?? null,
      });
    });
  }

  /**
   * キーで制限値を取得
   * @summary 制限値取得
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @returns 制限値情報（存在しない場合はnull）
   */
  getByKey(provider: string, model: string): LearnedLimit | null {
    const stmt = this.getStmtGetByKey();
    const key = this.makeKey(provider, model);
    const row = stmt.get({ provider_model: key }) as AdaptiveLimitRow | undefined;
    return row ? this.rowToLearnedLimit(row) : null;
  }

  /**
   * 全制限値を取得
   * @summary 全制限値取得
   * @returns 制限値のマップ
   */
  getAll(): Map<ProviderModelKey, LearnedLimit> {
    const stmt = this.getStmtGetAll();
    const rows = stmt.all() as AdaptiveLimitRow[];
    const result = new Map<ProviderModelKey, LearnedLimit>();
    for (const row of rows) {
      result.set(row.provider_model as ProviderModelKey, this.rowToLearnedLimit(row));
    }
    return result;
  }

  /**
   * 制限値を削除
   * @summary 制限値削除
   * @param provider - プロバイダ名
   * @param model - モデル名
   */
  delete(provider: string, model: string): void {
    const stmt = this.getStmtDelete();
    const key = this.makeKey(provider, model);
    this.runWithBusyRetry(() => {
      stmt.run({ provider_model: key });
    });
  }

  /**
   * 429エラーを記録
   * @summary 429記録
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param reductionFactor - 低減係数
   * @param defaultConcurrency - 新規作成時のデフォルト並列数
   */
  record429(
    provider: string,
    model: string,
    reductionFactor: number,
    defaultConcurrency: number = 1,
  ): LearnedLimit {
    const key = this.makeKey(provider, model);
    const now = timestampNow();

    return this.runWithBusyRetry(() => this.db.transaction(() => {
      let current = this.getByKey(provider, model);

      if (!current) {
        // 新規作成
        current = {
          concurrency: defaultConcurrency,
          originalConcurrency: defaultConcurrency,
          last429At: now,
          consecutive429Count: 1,
          total429Count: 1,
          lastSuccessAt: null,
          recoveryScheduled: false,
        };
      } else {
        // 更新
        current.concurrency = Math.max(1, current.concurrency * reductionFactor);
        current.last429At = now;
        current.consecutive429Count++;
        current.total429Count++;
      }

      // 履歴に追加
      const history = current.historical429s ?? [];
      history.push(now);
      // 直近100件のみ保持
      if (history.length > 100) {
        history.shift();
      }
      current.historical429s = history;

      this.upsert(provider, model, current);
      return current;
    }));
  }

  /**
   * 成功を記録
   * @summary 成功記録
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param recoveryFactor - 回復係数
   */
  recordSuccess(provider: string, model: string, recoveryFactor: number): LearnedLimit {
    const key = this.makeKey(provider, model);
    const now = timestampNow();
    
    return this.runWithBusyRetry(() => this.db.transaction(() => {
      let current = this.getByKey(provider, model);
      
      if (!current) {
        // 新規作成
        current = {
          concurrency: 1,
          originalConcurrency: 1,
          last429At: null,
          consecutive429Count: 0,
          total429Count: 0,
          lastSuccessAt: now,
          recoveryScheduled: false,
        };
      } else {
        // 更新
        current.consecutive429Count = 0;
        current.lastSuccessAt = now;
        
        // 回復（元の制限値を超えないように）
        if (current.concurrency < current.originalConcurrency) {
          current.concurrency = Math.min(
            current.originalConcurrency,
            current.concurrency * recoveryFactor
          );
        }
      }
      
      this.upsert(provider, model, current);
      return current;
    }));
  }

  /**
   * 回復スケジュールを設定
   * @summary 回復スケジュール設定
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param scheduled - スケジュール状態
   */
  setRecoveryScheduled(provider: string, model: string, scheduled: boolean): void {
    const key = this.makeKey(provider, model);
    const stmt = this.db.prepare(`
      UPDATE adaptive_limits 
      SET recovery_scheduled = @scheduled
      WHERE provider_model = @provider_model
    `);
    this.runWithBusyRetry(() => {
      stmt.run({ provider_model: key, scheduled: scheduled ? 1 : 0 });
    });
  }

  /**
   * 予測確率を更新
   * @summary 予測確率更新
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param probability - 429確率（0-1）
   */
  updatePredictedProbability(provider: string, model: string, probability: number): void {
    const key = this.makeKey(provider, model);
    const stmt = this.db.prepare(`
      UPDATE adaptive_limits 
      SET predicted_429_probability = @probability
      WHERE provider_model = @provider_model
    `);
    this.runWithBusyRetry(() => {
      stmt.run({ provider_model: key, probability });
    });
  }

  /**
   * ランプアップスケジュールを設定
   * @summary ランプアップ設定
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param schedule - スケジュール配列
   */
  setRampUpSchedule(provider: string, model: string, schedule: number[]): void {
    const key = this.makeKey(provider, model);
    const stmt = this.db.prepare(`
      UPDATE adaptive_limits 
      SET ramp_up_schedule_json = @schedule
      WHERE provider_model = @provider_model
    `);
    this.runWithBusyRetry(() => {
      stmt.run({ provider_model: key, schedule: safeStringifyJson(schedule) });
    });
  }

  // ========================================================================
  // 便利メソッド（adaptive-rate-controller.ts用）
  // ========================================================================

  /**
   * 制限値を取得（デフォルト値付き）
   * @summary 制限値取得（デフォルト付き）
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param defaultConcurrency - デフォルトの並列数
   * @returns 制限値情報
   */
  getLimit(provider: string, model: string, defaultConcurrency: number): LearnedLimit {
    const existing = this.getByKey(provider, model);
    if (existing) return existing;

    // 新規作成
    return {
      concurrency: defaultConcurrency,
      originalConcurrency: defaultConcurrency,
      last429At: null,
      consecutive429Count: 0,
      total429Count: 0,
      lastSuccessAt: null,
      recoveryScheduled: false,
    };
  }

  /**
   * 制限値を部分的に更新
   * @summary 制限値部分更新
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param partial - 更新するフィールド
   */
  updateLimit(
    provider: string,
    model: string,
    partial: Partial<LearnedLimit> & { concurrency?: number },
  ): void {
    const existing = this.getByKey(provider, model);
    if (existing) {
      this.upsert(provider, model, { ...existing, ...partial });
    } else {
      // 新規作成
      const newLimit: LearnedLimit = {
        concurrency: partial.concurrency ?? 1,
        originalConcurrency: partial.concurrency ?? 1,
        last429At: partial.last429At ?? null,
        consecutive429Count: partial.consecutive429Count ?? 0,
        total429Count: partial.total429Count ?? 0,
        lastSuccessAt: partial.lastSuccessAt ?? null,
        recoveryScheduled: partial.recoveryScheduled ?? false,
      };
      this.upsert(provider, model, newLimit);
    }
  }

  /**
   * 全制限値をクリア
   * @summary 全制限値クリア
   */
  clearAll(): void {
    const stmt = this.db.prepare("DELETE FROM adaptive_limits");
    this.runWithBusyRetry(() => {
      stmt.run();
    });
  }

  /**
   * 古いエントリを削除
   * @summary 古いエントリ削除
   * @param maxAgeMs - 最大経過時間（ミリ秒）
   * @returns 削除されたエントリ数
   */
  pruneOldEntries(maxAgeMs: number): number {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const stmt = this.db.prepare(`
      DELETE FROM adaptive_limits
      WHERE last_success_at < @cutoff
        AND last_429_at < @cutoff
    `);
    const result = this.runWithBusyRetry(() => stmt.run({ cutoff }));
    return result.changes;
  }

  // ========================================================================
  // プライベートメソッド
  // ========================================================================

  private makeKey(provider: string, model: string): ProviderModelKey {
    return `${provider.toLowerCase()}:${model.toLowerCase()}` as ProviderModelKey;
  }

  private rowToLearnedLimit(row: AdaptiveLimitRow): LearnedLimit {
    return {
      concurrency: row.concurrency,
      originalConcurrency: row.original_concurrency,
      last429At: row.last_429_at,
      consecutive429Count: row.consecutive_429_count,
      total429Count: row.total_429_count,
      lastSuccessAt: row.last_success_at,
      recoveryScheduled: row.recovery_scheduled === 1,
      historical429s: safeParseJson<string[]>(row.historical_429s_json, []),
      predicted429Probability: row.predicted_429_probability,
      rampUpSchedule: safeParseJson<number[]>(row.ramp_up_schedule_json, []),
      notes: row.notes ?? undefined,
    };
  }

  private getStmtUpsert(): import("better-sqlite3").Statement {
    if (!this.stmtUpsert) {
      this.stmtUpsert = this.db.prepare(`
        INSERT INTO adaptive_limits 
          (provider_model, concurrency, original_concurrency, last_429_at,
           consecutive_429_count, total_429_count, last_success_at,
           recovery_scheduled, historical_429s_json, predicted_429_probability,
           ramp_up_schedule_json, notes)
        VALUES 
          (@provider_model, @concurrency, @original_concurrency, @last_429_at,
           @consecutive_429_count, @total_429_count, @last_success_at,
           @recovery_scheduled, @historical_429s_json, @predicted_429_probability,
           @ramp_up_schedule_json, @notes)
        ON CONFLICT(provider_model) DO UPDATE SET
          concurrency = excluded.concurrency,
          original_concurrency = excluded.original_concurrency,
          last_429_at = excluded.last_429_at,
          consecutive_429_count = excluded.consecutive_429_count,
          total_429_count = excluded.total_429_count,
          last_success_at = excluded.last_success_at,
          recovery_scheduled = excluded.recovery_scheduled,
          historical_429s_json = excluded.historical_429s_json,
          predicted_429_probability = excluded.predicted_429_probability,
          ramp_up_schedule_json = excluded.ramp_up_schedule_json,
          notes = excluded.notes
      `);
    }
    return this.stmtUpsert;
  }

  private getStmtGetByKey(): import("better-sqlite3").Statement {
    if (!this.stmtGetByKey) {
      this.stmtGetByKey = this.db.prepare(
        "SELECT * FROM adaptive_limits WHERE provider_model = @provider_model"
      );
    }
    return this.stmtGetByKey;
  }

  private getStmtGetAll(): import("better-sqlite3").Statement {
    if (!this.stmtGetAll) {
      this.stmtGetAll = this.db.prepare("SELECT * FROM adaptive_limits");
    }
    return this.stmtGetAll;
  }

  private getStmtDelete(): import("better-sqlite3").Statement {
    if (!this.stmtDelete) {
      this.stmtDelete = this.db.prepare(
        "DELETE FROM adaptive_limits WHERE provider_model = @provider_model"
      );
    }
    return this.stmtDelete;
  }
}

// シングルトンインスタンス
let instance: AdaptiveLimitRepository | null = null;

/**
 * getDatabase関数を登録（循環依存回避のため）
 * @summary getDatabase登録
 * @param fn - getDatabase関数
 */
export function setGetDatabase(fn: () => PiDatabase): void {
  getDatabaseImpl = fn;
}

/**
 * 適応的制限リポジトリを作成
 * @summary リポジトリ作成
 * @param db - データベースインスタンス（省略時はgetDatabase()を使用）
 * @returns リポジトリインスタンス
 */
export function createAdaptiveLimitRepository(db?: PiDatabase): AdaptiveLimitRepository {
  if (!instance || db) {
    if (!db) {
      if (!getDatabaseImpl) {
        throw new Error("getDatabase not set. Call setGetDatabase() first.");
      }
      db = getDatabaseImpl();
    }
    instance = new AdaptiveLimitRepository(db);
  }
  return instance;
}

/**
 * テスト用にリポジトリをリセット
 * @summary リポジトリリセット
 */
export function resetAdaptiveLimitRepository(): void {
  instance = null;
}
