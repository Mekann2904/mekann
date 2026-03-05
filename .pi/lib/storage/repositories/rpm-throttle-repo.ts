/**
 * @abdd.meta
 * path: .pi/lib/storage/repositories/rpm-throttle-repo.ts
 * role: RPMスロットリング状態の永続化を管理するリポジトリ
 * why: rpm-throttle.tsのデータアクセスを抽象化し、SQLiteへの移行を容易にするため
 * related: .pi/lib/storage/sqlite-db.ts, .pi/extensions/rpm-throttle.ts
 * public_api: RpmThrottleRepository, createRpmThrottleRepository, BucketState
 * invariants: トランザクション内でのみ書き込み、JSONフィールドは正しくシリアライズ
 * side_effects: データベースへの読み書き
 * failure_modes: データベース接続エラー、JSONパースエラー
 * @abdd.explain
 * overview: RPMスロットリング状態のCRUD操作を提供するリポジトリパターンの実装
 * what_it_does:
 *   - プロバイダ/モデルごとのスロットル状態の登録・更新
 *   - リクエスト開始時刻の記録とウィンドウ管理
 *   - クールダウン状態の管理
 * why_it_exists:
 *   - データアクセスロジックをビジネスロジックから分離するため
 *   - 将来的なストレージ変更を容易にするため
 * scope:
 *   in: BucketState型のデータ
 *   out: データベース操作の結果
 */

import type { PiDatabase } from "../sqlite-db.js";
import { safeParseJson, safeStringifyJson, timestampMs } from "../sqlite-schema.js";

// 遅延初期化用
let getDatabaseImpl: (() => PiDatabase) | null = null;

/**
 * バケット状態
 * @summary スロットル状態
 */
export interface BucketState {
  /** 直近ウィンドウ内のリクエスト開始時刻（ミリ秒） */
  requestStartsMs: number[];
  /** クールダウン終了時刻（ミリ秒） */
  cooldownUntilMs: number;
  /** 最終アクセス時刻（ミリ秒） */
  lastAccessedMs: number;
}

/**
 * プロバイダとモデルの複合キー
 */
export type ProviderModelKey = `${string}:${string}`;

/**
 * データベース行の型定義
 */
interface RpmThrottleRow {
  provider_model: string;
  request_starts_json: string;
  cooldown_until_ms: number;
  last_accessed_ms: number;
}

/**
 * RPMスロットリングリポジトリ
 * @summary RPMスロットル状態の永続化を管理
 */
export class RpmThrottleRepository {
  private readonly db: PiDatabase;

  // プリペアドステートメント（キャッシュ用）
  private stmtUpsert: import("better-sqlite3").Statement | null = null;
  private stmtGetByKey: import("better-sqlite3").Statement | null = null;
  private stmtGetAll: import("better-sqlite3").Statement | null = null;
  private stmtDelete: import("better-sqlite3").Statement | null = null;
  private stmtDeleteExpired: import("better-sqlite3").Statement | null = null;

  constructor(db: PiDatabase) {
    this.db = db;
  }

  /**
   * バケット状態を登録または更新（upsert）
   * @summary バケット状態登録
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param state - バケット状態
   */
  upsert(provider: string, model: string, state: BucketState): void {
    const stmt = this.getStmtUpsert();
    const key = this.makeKey(provider, model);
    stmt.run({
      provider_model: key,
      request_starts_json: safeStringifyJson(state.requestStartsMs),
      cooldown_until_ms: state.cooldownUntilMs,
      last_accessed_ms: state.lastAccessedMs,
    });
  }

  /**
   * キーでバケット状態を取得
   * @summary バケット状態取得
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @returns バケット状態（存在しない場合はnull）
   */
  getByKey(provider: string, model: string): BucketState | null {
    const stmt = this.getStmtGetByKey();
    const key = this.makeKey(provider, model);
    const row = stmt.get({ provider_model: key }) as RpmThrottleRow | undefined;
    return row ? this.rowToBucketState(row) : null;
  }

  /**
   * 全バケット状態を取得
   * @summary 全状態取得
   * @returns プロバイダ/モデルごとのバケット状態
   */
  getAll(): Map<ProviderModelKey, BucketState> {
    const stmt = this.getStmtGetAll();
    const rows = stmt.all() as RpmThrottleRow[];
    const result = new Map<ProviderModelKey, BucketState>();
    for (const row of rows) {
      result.set(row.provider_model as ProviderModelKey, this.rowToBucketState(row));
    }
    return result;
  }

  /**
   * バケット状態を削除
   * @summary バケット状態削除
   * @param provider - プロバイダ名
   * @param model - モデル名
   */
  delete(provider: string, model: string): void {
    const stmt = this.getStmtDelete();
    const key = this.makeKey(provider, model);
    stmt.run({ provider_model: key });
  }

  /**
   * 期限切れバケットを一括削除
   * @summary 期限切れ削除
   * @param maxAgeMs - 最大経過時間（ミリ秒）
   * @returns 削除された件数
   */
  deleteExpired(maxAgeMs: number): number {
    const stmt = this.getStmtDeleteExpired();
    const cutoff = timestampMs() - maxAgeMs;
    const result = stmt.run({ cutoff });
    return result.changes;
  }

  /**
   * リクエストを記録
   * @summary リクエスト記録
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param nowMs - 現在時刻（ミリ秒）
   * @param windowMs - ウィンドウサイズ（ミリ秒）
   * @returns 更新後のバケット状態
   */
  recordRequest(provider: string, model: string, nowMs: number, windowMs: number): BucketState {
    const key = this.makeKey(provider, model);
    
    return this.db.transaction(() => {
      let state = this.getByKey(provider, model);
      
      if (!state) {
        state = {
          requestStartsMs: [],
          cooldownUntilMs: 0,
          lastAccessedMs: nowMs,
        };
      }
      
      // ウィンドウ外のリクエストを削除
      state.requestStartsMs = state.requestStartsMs.filter(
        (t) => nowMs - t < windowMs
      );
      
      // 新しいリクエストを追加
      state.requestStartsMs.push(nowMs);
      state.lastAccessedMs = nowMs;
      
      this.upsert(provider, model, state);
      return state;
    });
  }

  /**
   * クールダウンを設定
   * @summary クールダウン設定
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param cooldownMs - クールダウン時間（ミリ秒）
   * @param nowMs - 現在時刻（ミリ秒）
   */
  setCooldown(provider: string, model: string, cooldownMs: number, nowMs: number): void {
    const key = this.makeKey(provider, model);
    
    this.db.transaction(() => {
      let state = this.getByKey(provider, model);
      
      if (!state) {
        state = {
          requestStartsMs: [],
          cooldownUntilMs: nowMs + cooldownMs,
          lastAccessedMs: nowMs,
        };
      } else {
        state.cooldownUntilMs = nowMs + cooldownMs;
        state.lastAccessedMs = nowMs;
      }
      
      this.upsert(provider, model, state);
    });
  }

  /**
   * クールダウンをクリア
   * @summary クールダウンクリア
   * @param provider - プロバイダ名
   * @param model - モデル名
   */
  clearCooldown(provider: string, model: string): void {
    const key = this.makeKey(provider, model);
    const stmt = this.db.prepare(`
      UPDATE rpm_throttle 
      SET cooldown_until_ms = 0
      WHERE provider_model = @provider_model
    `);
    stmt.run({ provider_model: key });
  }

  /**
   * クールダウン中かどうか確認
   * @summary クールダウン確認
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param nowMs - 現在時刻（ミリ秒）
   * @returns クールダウン中の場合true
   */
  isInCooldown(provider: string, model: string, nowMs: number): boolean {
    const state = this.getByKey(provider, model);
    if (!state) return false;
    return nowMs < state.cooldownUntilMs;
  }

  /**
   * 残りクールダウン時間を取得
   * @summary 残り時間取得
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param nowMs - 現在時刻（ミリ秒）
   * @returns 残り時間（ミリ秒）、クールダウン外の場合0
   */
  getRemainingCooldown(provider: string, model: string, nowMs: number): number {
    const state = this.getByKey(provider, model);
    if (!state) return 0;
    return Math.max(0, state.cooldownUntilMs - nowMs);
  }

  /**
   * ウィンドウ内のリクエスト数を取得
   * @summary リクエスト数取得
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param nowMs - 現在時刻（ミリ秒）
   * @param windowMs - ウィンドウサイズ（ミリ秒）
   * @returns ウィンドウ内のリクエスト数
   */
  getRequestCountInWindow(provider: string, model: string, nowMs: number, windowMs: number): number {
    const state = this.getByKey(provider, model);
    if (!state) return 0;
    return state.requestStartsMs.filter((t) => nowMs - t < windowMs).length;
  }

  // ========================================================================
  // プライベートメソッド
  // ========================================================================

  private makeKey(provider: string, model: string): ProviderModelKey {
    return `${provider.toLowerCase()}:${model.toLowerCase()}` as ProviderModelKey;
  }

  private rowToBucketState(row: RpmThrottleRow): BucketState {
    return {
      requestStartsMs: safeParseJson<number[]>(row.request_starts_json, []).filter(
        (v): v is number => Number.isFinite(v) && v > 0
      ),
      cooldownUntilMs: row.cooldown_until_ms,
      lastAccessedMs: row.last_accessed_ms,
    };
  }

  private getStmtUpsert(): import("better-sqlite3").Statement {
    if (!this.stmtUpsert) {
      this.stmtUpsert = this.db.prepare(`
        INSERT INTO rpm_throttle 
          (provider_model, request_starts_json, cooldown_until_ms, last_accessed_ms)
        VALUES 
          (@provider_model, @request_starts_json, @cooldown_until_ms, @last_accessed_ms)
        ON CONFLICT(provider_model) DO UPDATE SET
          request_starts_json = excluded.request_starts_json,
          cooldown_until_ms = excluded.cooldown_until_ms,
          last_accessed_ms = excluded.last_accessed_ms
      `);
    }
    return this.stmtUpsert;
  }

  private getStmtGetByKey(): import("better-sqlite3").Statement {
    if (!this.stmtGetByKey) {
      this.stmtGetByKey = this.db.prepare(
        "SELECT * FROM rpm_throttle WHERE provider_model = @provider_model"
      );
    }
    return this.stmtGetByKey;
  }

  private getStmtGetAll(): import("better-sqlite3").Statement {
    if (!this.stmtGetAll) {
      this.stmtGetAll = this.db.prepare("SELECT * FROM rpm_throttle");
    }
    return this.stmtGetAll;
  }

  private getStmtDelete(): import("better-sqlite3").Statement {
    if (!this.stmtDelete) {
      this.stmtDelete = this.db.prepare(
        "DELETE FROM rpm_throttle WHERE provider_model = @provider_model"
      );
    }
    return this.stmtDelete;
  }

  private getStmtDeleteExpired(): import("better-sqlite3").Statement {
    if (!this.stmtDeleteExpired) {
      this.stmtDeleteExpired = this.db.prepare(
        "DELETE FROM rpm_throttle WHERE last_accessed_ms < @cutoff"
      );
    }
    return this.stmtDeleteExpired;
  }
}

// シングルトンインスタンス
let instance: RpmThrottleRepository | null = null;

/**
 * getDatabase関数を登録（循環依存回避のため）
 * @summary getDatabase登録
 * @param fn - getDatabase関数
 */
export function setGetDatabase(fn: () => PiDatabase): void {
  getDatabaseImpl = fn;
}

/**
 * RPMスロットルリポジトリを作成
 * @summary リポジトリ作成
 * @param db - データベースインスタンス（省略時はgetDatabase()を使用）
 * @returns リポジトリインスタンス
 */
export function createRpmThrottleRepository(db?: PiDatabase): RpmThrottleRepository {
  if (!instance || db) {
    if (!db) {
      if (!getDatabaseImpl) {
        throw new Error("getDatabase not set. Call setGetDatabase() first.");
      }
      db = getDatabaseImpl();
    }
    instance = new RpmThrottleRepository(db);
  }
  return instance;
}

/**
 * テスト用にリポジトリをリセット
 * @summary リポジトリリセット
 */
export function resetRpmThrottleRepository(): void {
  instance = null;
}
