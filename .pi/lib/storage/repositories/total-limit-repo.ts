/**
 * @abdd.meta
 * path: .pi/lib/storage/repositories/total-limit-repo.ts
 * role: 適応的全体並列数制御のリポジトリ
 * why: SQLiteデータベースでの適応的並列数制御状態の永続化を行うため
 * related: .pi/lib/adaptive-total-limit.ts, .pi/lib/storage/sqlite-db.ts
 * public_api: TotalLimitRepository, createTotalLimitRepository
 * invariants: learnedLimitはminLimit以上hardMax以下
 * side_effects: SQLiteデータベースへの読み書き
 * failure_modes: データベースエラー時は例外をスロー
 * @abdd.explain
 * overview: 適応的並列数制御の状態をSQLiteで管理するリポジトリ
 * what_it_does:
 *   - 全体制限値のCRUD操作
 *   - 観測サンプルの蓄積と分析
 *   - 制限値の再計算結果の永続化
 * why_it_exists:
 *   - プロセス再起動後も状態を復元するため
 *   - 複数プロセス間での状態共有のため
 * scope:
 *   in: PiDatabaseインスタンス
 *   out: 永続化された制限値状態
 */

import type { PiDatabase } from "../sqlite-db.js";

// 遅延初期化用
let getDatabaseImpl: (() => PiDatabase) | null = null;

// ============================================================================
// Types
// ============================================================================

/**
 * 観測種別
 */
export type ObservationKind = "success" | "rate_limit" | "timeout" | "error";

/**
 * 観測サンプル
 */
export interface ObservationSample {
  kind: ObservationKind;
  latencyMs: number;
  waitMs: number;
  timestampMs: number;
}

/**
 * 全体制限値の状態
 */
export interface TotalLimitState {
  id: number;
  baseLimit: number;
  learnedLimit: number;
  hardMax: number;
  minLimit: number;
  lastUpdated: string;
  lastDecisionAtMs: number;
  cooldownUntilMs: number;
  lastReason: string;
  samples: ObservationSample[];
}

/**
 * データベース行型
 */
interface TotalLimitRow {
  id: number;
  base_limit: number;
  learned_limit: number;
  hard_max: number;
  min_limit: number;
  last_updated: string;
  last_decision_at_ms: number;
  cooldown_until_ms: number;
  last_reason: string;
  samples_json: string;
}

// ============================================================================
// Repository
// ============================================================================

/**
 * 適応的全体並列数制御リポジトリ
 */
export class TotalLimitRepository {
  private db: PiDatabase;

  constructor(db: PiDatabase) {
    this.db = db;
  }

  // ========================================================================
  // Read Operations
  // ========================================================================

  /**
   * 現在の状態を取得
   * @summary 状態取得
   * @returns 現在の状態（存在しない場合は初期状態）
   */
  getState(): TotalLimitState {
    const stmt = this.db.prepare<[], TotalLimitRow>(
      "SELECT * FROM total_limit WHERE id = 1"
    );
    const row = stmt.get() as TotalLimitRow | undefined;
    
    if (!row) {
      // 初期状態を返す
      return this.getDefaultState();
    }
    
    return this.rowToState(row);
  }

  /**
   * 初期状態を取得
   * @summary 初期状態取得
   * @returns 初期状態
   */
  getDefaultState(): TotalLimitState {
    const stmt = this.db.prepare<[], { base_limit: number; hard_max: number; min_limit: number }>(
      "SELECT base_limit, hard_max, min_limit FROM total_limit WHERE id = 1"
    );
    const config = stmt.get() as { base_limit: number; hard_max: number; min_limit: number } | undefined;
    
    if (!config) {
      // デフォルト値
      return {
        id: 1,
        baseLimit: 10,
        learnedLimit: 10,
        hardMax: 20,
        minLimit: 1,
        lastUpdated: new Date().toISOString(),
        lastDecisionAtMs: Date.now(),
        cooldownUntilMs: 0,
        lastReason: "initialized",
        samples: [],
      };
    }
    
    return {
      id: 1,
      baseLimit: config.base_limit,
      learnedLimit: config.base_limit,
      hardMax: config.hard_max,
      minLimit: config.min_limit,
      lastUpdated: new Date().toISOString(),
      lastDecisionAtMs: Date.now(),
      cooldownUntilMs: 0,
      lastReason: "initialized",
      samples: [],
    };
  }

  // ========================================================================
  // Write Operations
  // ========================================================================

  /**
   * 状態を更新
   * @summary 状態更新
   * @param state - 新しい状態
   */
  updateState(state: Partial<TotalLimitState>): void {
    const current = this.getState();
    const newState = { ...current, ...state, lastUpdated: new Date().toISOString() };
    
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO total_limit 
        (id, base_limit, learned_limit, hard_max, min_limit, last_updated,
         last_decision_at_ms, cooldown_until_ms, last_reason, samples_json)
       VALUES (1, @baseLimit, @learnedLimit, @hardMax, @minLimit, @lastUpdated,
               @lastDecisionAtMs, @cooldownUntilMs, @lastReason, @samplesJson)`
    );
    
    stmt.run({
      baseLimit: newState.baseLimit,
      learnedLimit: newState.learnedLimit,
      hardMax: newState.hardMax,
      minLimit: newState.minLimit,
      lastUpdated: newState.lastUpdated,
      lastDecisionAtMs: newState.lastDecisionAtMs,
      cooldownUntilMs: newState.cooldownUntilMs,
      lastReason: newState.lastReason,
      samplesJson: JSON.stringify(newState.samples ?? []),
    });
  }

  /**
   * 学習された制限値を更新
   * @summary 制限値更新
   * @param learnedLimit - 新しい制限値
   * @param reason - 更新理由
   */
  updateLearnedLimit(learnedLimit: number, reason: string): void {
    const stmt = this.db.prepare(
      `UPDATE total_limit 
       SET learned_limit = @learnedLimit, 
           last_reason = @reason,
           last_updated = @lastUpdated
       WHERE id = 1`
    );
    
    stmt.run({
      learnedLimit,
      reason,
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * クールダウンを設定
   * @summary クールダウン設定
   * @param cooldownUntilMs - クールダウン終了時刻（ミリ秒）
   */
  setCooldown(cooldownUntilMs: number): void {
    const stmt = this.db.prepare(
      `UPDATE total_limit 
       SET cooldown_until_ms = @cooldownUntilMs,
           last_updated = @lastUpdated
       WHERE id = 1`
    );
    
    stmt.run({
      cooldownUntilMs,
      lastUpdated: new Date().toISOString(),
    });
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private rowToState(row: TotalLimitRow): TotalLimitState {
    let samples: ObservationSample[] = [];
    try {
      const parsed = JSON.parse(row.samples_json || "[]") as ObservationSample[];
      if (Array.isArray(parsed)) {
        samples = parsed;
      }
    } catch {
      samples = [];
    }
    return {
      id: row.id,
      baseLimit: row.base_limit,
      learnedLimit: row.learned_limit,
      hardMax: row.hard_max,
      minLimit: row.min_limit,
      lastUpdated: row.last_updated,
      lastDecisionAtMs: row.last_decision_at_ms,
      cooldownUntilMs: row.cooldown_until_ms,
      lastReason: row.last_reason,
      samples,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let repositoryInstance: TotalLimitRepository | null = null;

/**
 * getDatabase関数を登録（循環依存回避のため）
 * @summary getDatabase登録
 * @param fn - getDatabase関数
 */
export function setGetDatabase(fn: () => PiDatabase): void {
  getDatabaseImpl = fn;
}

/**
 * リポジトリを作成
 * @summary リポジトリ作成
 */
export function createTotalLimitRepository(db?: PiDatabase): TotalLimitRepository {
  if (!repositoryInstance || db) {
    if (!db) {
      if (!getDatabaseImpl) {
        throw new Error("getDatabase not set. Call setGetDatabase() first.");
      }
      db = getDatabaseImpl();
    }
    repositoryInstance = new TotalLimitRepository(db);
  }
  return repositoryInstance;
}

/**
 * テスト用にリポジトリをリセット
 * @summary リポジトリリセット
 */
export function resetTotalLimitRepository(): void {
  repositoryInstance = null;
}
