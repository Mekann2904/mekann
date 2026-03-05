/**
 * @abdd.meta
 * path: .pi/lib/storage/repositories/instance-repo.ts
 * role: インスタンス情報の永続化を管理するリポジトリ
 * why: cross-instance-coordinator.tsのデータアクセスを抽象化し、SQLiteへの移行を容易にするため
 * related: .pi/lib/storage/sqlite-db.ts, .pi/lib/coordination/cross-instance-coordinator.ts
 * public_api: InstanceRepository, createInstanceRepository
 * invariants: トランザクション内でのみ書き込み、JSONフィールドは正しくシリアライズ
 * side_effects: データベースへの読み書き
 * failure_modes: データベース接続エラー、JSONパースエラー
 * @abdd.explain
 * overview: インスタンス情報のCRUD操作を提供するリポジトリパターンの実装
 * what_it_does:
 *   - インスタンス情報の登録・更新（upsert）
 *   - アクティブなインスタンスの検索
 *   - 期限切れインスタンスの削除
 *   - ハートビートの更新
 * why_it_exists:
 *   - データアクセスロジックをビジネスロジックから分離するため
 *   - 将来的なストレージ変更を容易にするため
 * scope:
 *   in: InstanceInfo型のデータ
 *   out: データベース操作の結果
 */

import type { PiDatabase } from "../sqlite-db.js";
import { safeParseJson, safeStringifyJson, timestampNow, timestampMs } from "../sqlite-schema.js";
import type { InstanceInfo, ActiveModelInfo } from "../../coordination/cross-instance-coordinator.js";

/**
 * データベース行の型定義
 */
interface InstanceRow {
  instance_id: string;
  pid: number;
  session_id: string;
  started_at: string;
  last_heartbeat: string;
  cwd: string;
  active_models_json: string;
  pending_task_count: number | null;
  active_request_count: number | null;
  active_llm_count: number | null;
  avg_latency_ms: number | null;
  last_task_completed_at: string | null;
}

/**
 * インスタンスリポジトリ
 * @summary インスタンス情報の永続化を管理
 */
export class InstanceRepository {
  private readonly db: PiDatabase;

  // プリペアドステートメント（キャッシュ用）
  private stmtUpsert: import("better-sqlite3").Statement | null = null;
  private stmtGetById: import("better-sqlite3").Statement | null = null;
  private stmtGetActive: import("better-sqlite3").Statement | null = null;
  private stmtUpdateHeartbeat: import("better-sqlite3").Statement | null = null;
  private stmtDelete: import("better-sqlite3").Statement | null = null;
  private stmtDeleteExpired: import("better-sqlite3").Statement | null = null;
  private stmtUpdateWorkload: import("better-sqlite3").Statement | null = null;
  private stmtUpdateRuntimeUsage: import("better-sqlite3").Statement | null = null;

  constructor(db: PiDatabase) {
    this.db = db;
  }

  /**
   * インスタンス情報を登録または更新（upsert）
   * @summary インスタンス登録
   * @param info - インスタンス情報
   */
  upsert(info: InstanceInfo): void {
    const stmt = this.getStmtUpsert();
    stmt.run({
      instance_id: info.instanceId,
      pid: info.pid,
      session_id: info.sessionId,
      started_at: info.startedAt,
      last_heartbeat: info.lastHeartbeat,
      cwd: info.cwd,
      active_models_json: safeStringifyJson(info.activeModels),
      pending_task_count: info.pendingTaskCount ?? 0,
      active_request_count: info.activeRequestCount ?? 0,
      active_llm_count: info.activeLlmCount ?? 0,
      avg_latency_ms: info.avgLatencyMs ?? null,
      last_task_completed_at: info.lastTaskCompletedAt ?? null,
    });
  }

  /**
   * IDでインスタンスを取得
   * @summary インスタンス取得
   * @param instanceId - インスタンスID
   * @returns インスタンス情報（存在しない場合はnull）
   */
  getById(instanceId: string): InstanceInfo | null {
    const stmt = this.getStmtGetById();
    const row = stmt.get({ instance_id: instanceId }) as InstanceRow | undefined;
    return row ? this.rowToInstanceInfo(row) : null;
  }

  /**
   * アクティブなインスタンス一覧を取得
   * @summary アクティブ一覧取得
   * @param timeoutMs - タイムアウト（ミリ秒）
   * @returns アクティブなインスタンスの配列
   */
  getActive(timeoutMs: number): InstanceInfo[] {
    const stmt = this.getStmtGetActive();
    const cutoff = new Date(timestampMs() - timeoutMs).toISOString();
    const rows = stmt.all({ cutoff }) as InstanceRow[];
    return rows.map((row) => this.rowToInstanceInfo(row));
  }

  /**
   * ハートビートを更新
   * @summary ハートビート更新
   * @param instanceId - インスタンスID
   * @param heartbeat - ハートビート時刻（省略時は現在時刻）
   */
  updateHeartbeat(instanceId: string, heartbeat?: string): void {
    const stmt = this.getStmtUpdateHeartbeat();
    stmt.run({
      instance_id: instanceId,
      last_heartbeat: heartbeat ?? timestampNow(),
    });
  }

  /**
   * アクティブモデルを更新
   * @summary モデル更新
   * @param instanceId - インスタンスID
   * @param activeModels - アクティブモデル一覧
   */
  updateActiveModels(instanceId: string, activeModels: ActiveModelInfo[]): void {
    const stmt = this.db.prepare(`
      UPDATE instances 
      SET active_models_json = @activeModelsJson, last_heartbeat = @heartbeat
      WHERE instance_id = @instanceId
    `);
    stmt.run({
      instanceId,
      activeModelsJson: safeStringifyJson(activeModels),
      heartbeat: timestampNow(),
    });
  }

  /**
   * ワークロード情報を更新
   * @summary ワークロード更新
   * @param instanceId - インスタンスID
   * @param pendingTaskCount - 保留タスク数
   * @param avgLatencyMs - 平均レイテンシ（省略可）
   */
  updateWorkload(instanceId: string, pendingTaskCount: number, avgLatencyMs?: number): void {
    const stmt = this.getStmtUpdateWorkload();
    stmt.run({
      instance_id: instanceId,
      pending_task_count: pendingTaskCount,
      avg_latency_ms: avgLatencyMs ?? null,
      last_task_completed_at: avgLatencyMs !== undefined ? timestampNow() : null,
      last_heartbeat: timestampNow(),
    });
  }

  /**
   * ランタイム使用量を更新
   * @summary 使用量更新
   * @param instanceId - インスタンスID
   * @param activeRequestCount - アクティブリクエスト数
   * @param activeLlmCount - アクティブLLM数
   */
  updateRuntimeUsage(instanceId: string, activeRequestCount: number, activeLlmCount: number): void {
    const stmt = this.getStmtUpdateRuntimeUsage();
    stmt.run({
      instance_id: instanceId,
      active_request_count: activeRequestCount,
      active_llm_count: activeLlmCount,
      last_heartbeat: timestampNow(),
    });
  }

  /**
   * インスタンスを削除
   * @summary インスタンス削除
   * @param instanceId - インスタンスID
   */
  delete(instanceId: string): void {
    const stmt = this.getStmtDelete();
    stmt.run({ instance_id: instanceId });
  }

  /**
   * 期限切れインスタンスを一括削除
   * @summary 期限切れ削除
   * @param timeoutMs - タイムアウト（ミリ秒）
   * @returns 削除された件数
   */
  deleteExpired(timeoutMs: number): number {
    const stmt = this.getStmtDeleteExpired();
    const cutoff = new Date(timestampMs() - timeoutMs).toISOString();
    const result = stmt.run({ cutoff });
    return result.changes;
  }

  /**
   * 全インスタンス数を取得
   * @summary 全件数取得
   * @returns インスタンス数
   */
  count(): number {
    const stmt = this.db.prepare<[], { count: number }>("SELECT COUNT(*) as count FROM instances");
    const result = stmt.get();
    return result?.count ?? 0;
  }

  /**
   * セッションIDでインスタンスを検索
   * @summary セッション検索
   * @param sessionId - セッションID
   * @returns インスタンス情報の配列
   */
  getBySessionId(sessionId: string): InstanceInfo[] {
    const stmt = this.db.prepare<{ sessionId: string }, InstanceRow>(`
      SELECT * FROM instances WHERE session_id = @sessionId
    `);
    const rows = stmt.all({ sessionId });
    return rows.map((row) => this.rowToInstanceInfo(row));
  }

  // ========================================================================
  // プライベートメソッド
  // ========================================================================

  private rowToInstanceInfo(row: InstanceRow): InstanceInfo {
    return {
      instanceId: row.instance_id,
      pid: row.pid,
      sessionId: row.session_id,
      startedAt: row.started_at,
      lastHeartbeat: row.last_heartbeat,
      cwd: row.cwd,
      activeModels: safeParseJson<ActiveModelInfo[]>(row.active_models_json, []),
      pendingTaskCount: row.pending_task_count ?? undefined,
      activeRequestCount: row.active_request_count ?? undefined,
      activeLlmCount: row.active_llm_count ?? undefined,
      avgLatencyMs: row.avg_latency_ms ?? undefined,
      lastTaskCompletedAt: row.last_task_completed_at ?? undefined,
    };
  }

  private getStmtUpsert(): import("better-sqlite3").Statement {
    if (!this.stmtUpsert) {
      this.stmtUpsert = this.db.prepare(`
        INSERT INTO instances 
          (instance_id, pid, session_id, started_at, last_heartbeat, cwd,
           active_models_json, pending_task_count, active_request_count, 
           active_llm_count, avg_latency_ms, last_task_completed_at)
        VALUES 
          (@instance_id, @pid, @session_id, @started_at, @last_heartbeat, @cwd,
           @active_models_json, @pending_task_count, @active_request_count,
           @active_llm_count, @avg_latency_ms, @last_task_completed_at)
        ON CONFLICT(instance_id) DO UPDATE SET
          last_heartbeat = excluded.last_heartbeat,
          active_models_json = excluded.active_models_json,
          pending_task_count = excluded.pending_task_count,
          active_request_count = excluded.active_request_count,
          active_llm_count = excluded.active_llm_count,
          avg_latency_ms = excluded.avg_latency_ms,
          last_task_completed_at = excluded.last_task_completed_at
      `);
    }
    return this.stmtUpsert;
  }

  private getStmtGetById(): import("better-sqlite3").Statement {
    if (!this.stmtGetById) {
      this.stmtGetById = this.db.prepare("SELECT * FROM instances WHERE instance_id = @instance_id");
    }
    return this.stmtGetById;
  }

  private getStmtGetActive(): import("better-sqlite3").Statement {
    if (!this.stmtGetActive) {
      this.stmtGetActive = this.db.prepare("SELECT * FROM instances WHERE last_heartbeat > @cutoff");
    }
    return this.stmtGetActive;
  }

  private getStmtUpdateHeartbeat(): import("better-sqlite3").Statement {
    if (!this.stmtUpdateHeartbeat) {
      this.stmtUpdateHeartbeat = this.db.prepare(`
        UPDATE instances SET last_heartbeat = @last_heartbeat 
        WHERE instance_id = @instance_id
      `);
    }
    return this.stmtUpdateHeartbeat;
  }

  private getStmtUpdateWorkload(): import("better-sqlite3").Statement {
    if (!this.stmtUpdateWorkload) {
      this.stmtUpdateWorkload = this.db.prepare(`
        UPDATE instances 
        SET pending_task_count = @pending_task_count,
            avg_latency_ms = @avg_latency_ms,
            last_task_completed_at = COALESCE(@last_task_completed_at, last_task_completed_at),
            last_heartbeat = @last_heartbeat
        WHERE instance_id = @instance_id
      `);
    }
    return this.stmtUpdateWorkload;
  }

  private getStmtUpdateRuntimeUsage(): import("better-sqlite3").Statement {
    if (!this.stmtUpdateRuntimeUsage) {
      this.stmtUpdateRuntimeUsage = this.db.prepare(`
        UPDATE instances 
        SET active_request_count = @active_request_count,
            active_llm_count = @active_llm_count,
            last_heartbeat = @last_heartbeat
        WHERE instance_id = @instance_id
      `);
    }
    return this.stmtUpdateRuntimeUsage;
  }

  private getStmtDelete(): import("better-sqlite3").Statement {
    if (!this.stmtDelete) {
      this.stmtDelete = this.db.prepare("DELETE FROM instances WHERE instance_id = @instance_id");
    }
    return this.stmtDelete;
  }

  private getStmtDeleteExpired(): import("better-sqlite3").Statement {
    if (!this.stmtDeleteExpired) {
      this.stmtDeleteExpired = this.db.prepare(
        "DELETE FROM instances WHERE last_heartbeat <= @cutoff"
      );
    }
    return this.stmtDeleteExpired;
  }
}

// シングルトンインスタンス
let instance: InstanceRepository | null = null;

/**
 * インスタンスリポジトリを作成
 * @summary リポジトリ作成
 * @param db - データベースインスタンス（省略時はgetDatabase()を使用）
 * @returns リポジトリインスタンス
 */
export function createInstanceRepository(db?: PiDatabase): InstanceRepository {
  if (!instance || db) {
    // 循環依存を避けるため遅延インポート
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDatabase } = require("../sqlite-db.js");
    instance = new InstanceRepository(db ?? getDatabase());
  }
  return instance;
}

/**
 * テスト用にリポジトリをリセット
 * @summary リポジトリリセット
 */
export function resetInstanceRepository(): void {
  instance = null;
}
