/**
 * @abdd.meta
 * path: .pi/lib/coordination/cross-instance-coordinator-sqlite.ts
 * role: SQLiteベースの複数piインスタンス間調整コーディネータ
 * why: ファイルベースのロック問題を解決し、ACID保証でデータ整合性を確保するため
 * related: .pi/lib/coordination/cross-instance-coordinator.ts, .pi/lib/storage/repositories/instance-repo.ts
 * public_api: SQLiteCoordinator, createSQLiteCoordinator, USE_SQLITE_COORDINATOR
 * invariants: トランザクション内で一貫性を保証、WALモードで並列性を確保
 * side_effects: ~/.pi/runtime/pi-coordinator.dbへの読み書き
 * failure_modes: SQLite利用不可時はJSON版にフォールバック
 * @abdd.explain
 * overview: SQLite + WALモードを使用したインスタンス間調整の実装
 * what_it_does:
 *   - インスタンス登録・ハートビート管理
 *   - アクティブインスタンスの追跡
 *   - 並列数制限の動的計算
 *   - ワークスチーリング機能
 * why_it_exists:
 *   - ファイルベースのロック競合問題を解決するため
 *   - トランザクションによる一貫性を保証するため
 * scope:
 *   in: InstanceInfo, RuntimeConfig
 *   out: 並列数制限、インスタンス一覧
 */

import { pid } from "node:process";
import { randomBytes } from "node:crypto";
import type { PiDatabase } from "../storage/sqlite-db.js";
import { isSQLiteAvailable, getDatabase } from "../storage/sqlite-db.js";
import { timestampNow, timestampMs } from "../storage/sqlite-schema.js";
import type { InstanceInfo, ActiveModelInfo, CoordinatorConfig } from "./cross-instance-coordinator.js";
import { getRuntimeConfig } from "../runtime-config.js";
import { getAdaptiveTotalMaxLlm } from "../adaptive-total-limit.js";

// 機能フラグ
export const USE_SQLITE_COORDINATOR = process.env.PI_USE_SQLITE !== "0" && isSQLiteAvailable();

/**
 * SQLiteベースのコーディネータ内部状態
 */
interface SQLiteCoordinatorState {
  myInstanceId: string;
  mySessionId: string;
  myStartedAt: string;
  config: CoordinatorConfig;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}

/**
 * SQLiteベースのコーディネータ
 */
export class SQLiteCoordinator {
  private db: PiDatabase;
  private state: SQLiteCoordinatorState | null = null;
  private nowProvider: () => number = () => Date.now();
  
  // プリペアドステートメント
  private stmtUpsertInstance: import("better-sqlite3").Statement | null = null;
  private stmtGetInstance: import("better-sqlite3").Statement | null = null;
  private stmtGetActiveInstances: import("better-sqlite3").Statement | null = null;
  private stmtUpdateHeartbeat: import("better-sqlite3").Statement | null = null;
  private stmtDeleteInstance: import("better-sqlite3").Statement | null = null;
  private stmtDeleteExpired: import("better-sqlite3").Statement | null = null;
  private stmtUpdateActiveModels: import("better-sqlite3").Statement | null = null;
  private stmtUpdateWorkload: import("better-sqlite3").Statement | null = null;
  private stmtUpdateRuntimeUsage: import("better-sqlite3").Statement | null = null;

  constructor(db?: PiDatabase) {
    this.db = db ?? getDatabase();
  }

  // ========================================================================
  // Public API (cross-instance-coordinator.tsと互換)
  // ========================================================================

  /**
   * インスタンスを登録
   * @summary インスタンス登録
   */
  registerInstance(
    sessionId: string,
    cwd: string,
    configOverrides?: Partial<CoordinatorConfig>
  ): void {
    if (this.state) {
      this.updateHeartbeat();
      return;
    }

    const runtimeConfig = getRuntimeConfig();
    const defaults: CoordinatorConfig = {
      totalMaxLlm: runtimeConfig.totalMaxLlm,
      heartbeatIntervalMs: runtimeConfig.heartbeatIntervalMs,
      heartbeatTimeoutMs: runtimeConfig.heartbeatTimeoutMs,
    };
    const config = { ...defaults, ...configOverrides };

    const instanceId = this.generateInstanceId(sessionId);
    const nowIso = timestampNow();

    const info: InstanceInfo = {
      instanceId,
      pid,
      sessionId,
      startedAt: nowIso,
      lastHeartbeat: nowIso,
      cwd,
      activeModels: [],
    };

    this.db.transaction(() => {
      this.upsertInstance(info);
    });

    // ハートビートタイマー開始
    const heartbeatTimer = setInterval(() => {
      this.updateHeartbeat();
      this.cleanupDeadInstances();
    }, config.heartbeatIntervalMs);
    heartbeatTimer.unref();

    this.state = {
      myInstanceId: instanceId,
      mySessionId: sessionId,
      myStartedAt: nowIso,
      config,
      heartbeatTimer,
    };

    // シャットダウンフック
    this.registerShutdownHooks();
  }

  /**
   * インスタンス登録を解除
   * @summary 登録解除
   */
  unregisterInstance(): void {
    if (!this.state) return;

    if (this.state.heartbeatTimer) {
      clearInterval(this.state.heartbeatTimer);
    }

    this.db.transaction(() => {
      this.deleteInstance(this.state!.myInstanceId);
    });

    this.state = null;
  }

  /**
   * ハートビートを更新
   * @summary ハートビート更新
   */
  updateHeartbeat(): void {
    if (!this.state) return;
    
    const now = timestampNow();
    this.db.transaction(() => {
      this.updateHeartbeatInternal(this.state!.myInstanceId, now);
    });
  }

  /**
   * 期限切れインスタンスを削除
   * @summary 期限切れ削除
   */
  cleanupDeadInstances(): void {
    if (!this.state) return;
    
    this.db.transaction(() => {
      this.deleteExpiredInstances(this.state!.config.heartbeatTimeoutMs);
    });
  }

  /**
   * アクティブなインスタンス数を取得
   * @summary アクティブ数取得
   */
  getActiveInstanceCount(): number {
    if (!this.state) return 1;
    
    const instances = this.getActiveInstances();
    return Math.max(1, instances.length);
  }

  /**
   * アクティブなインスタンス一覧を取得
   * @summary インスタンス一覧取得
   */
  getActiveInstances(): InstanceInfo[] {
    if (!this.state) return [];
    
    const cutoff = new Date(timestampMs() - this.state.config.heartbeatTimeoutMs).toISOString();
    return this.db.transaction(() => {
      return this.getActiveInstancesInternal(cutoff);
    });
  }

  /**
   * 自分の並列数上限を取得
   * @summary 並列数上限取得
   */
  getMyParallelLimit(): number {
    if (!this.state) return 1;
    
    const contendingCount = this.getContendingInstanceCount();
    return Math.max(1, Math.floor(this.state.config.totalMaxLlm / contendingCount));
  }

  /**
   * 競合インスタンス数を取得
   * @summary 競合数取得
   */
  getContendingInstanceCount(): number {
    if (!this.state) return 1;
    
    const instances = this.getActiveInstances();
    const contending = instances.filter((inst) => this.isContendingInstance(inst));
    const includesSelf = contending.some((inst) => inst.instanceId === this.state!.myInstanceId);
    
    if (!includesSelf) {
      return Math.max(1, contending.length + 1);
    }
    return Math.max(1, contending.length);
  }

  /**
   * アクティブモデルを設定
   * @summary モデル設定
   */
  setActiveModel(provider: string, model: string): void {
    if (!this.state) return;
    
    const now = timestampNow();
    const normalizedProvider = provider.toLowerCase();
    const normalizedModel = model.toLowerCase();
    
    this.db.transaction(() => {
      const current = this.getInstance(this.state!.myInstanceId);
      if (!current) return;
      
      const existing = current.activeModels.find(
        (m) => m.provider === normalizedProvider && m.model === normalizedModel
      );
      
      if (!existing) {
        current.activeModels.push({
          provider: normalizedProvider,
          model: normalizedModel,
          since: now,
        });
      }
      
      this.updateActiveModels(this.state!.myInstanceId, current.activeModels);
    });
  }

  /**
   * アクティブモデルをクリア
   * @summary モデルクリア
   */
  clearActiveModel(provider: string, model: string): void {
    if (!this.state) return;
    
    const normalizedProvider = provider.toLowerCase();
    const normalizedModel = model.toLowerCase();
    
    this.db.transaction(() => {
      const current = this.getInstance(this.state!.myInstanceId);
      if (!current) return;
      
      current.activeModels = current.activeModels.filter(
        (m) => !(m.provider === normalizedProvider && m.model === normalizedModel)
      );
      
      this.updateActiveModels(this.state!.myInstanceId, current.activeModels);
    });
  }

  /**
   * 全アクティブモデルをクリア
   * @summary 全モデルクリア
   */
  clearAllActiveModels(): void {
    if (!this.state) return;
    this.updateActiveModels(this.state.myInstanceId, []);
  }

  /**
   * ワークロード情報を更新
   * @summary ワークロード更新
   */
  updateWorkloadInfo(pendingTaskCount: number, avgLatencyMs?: number): void {
    if (!this.state) return;
    this.updateWorkloadInternal(this.state.myInstanceId, pendingTaskCount, avgLatencyMs);
  }

  /**
   * ランタイム使用量を更新
   * @summary 使用量更新
   */
  updateRuntimeUsage(activeRequestCount: number, activeLlmCount: number): void {
    if (!this.state) return;
    this.updateRuntimeUsageInternal(this.state.myInstanceId, activeRequestCount, activeLlmCount);
  }

  /**
   * コーディネータ状態を取得
   * @summary 状態取得
   */
  getCoordinatorStatus(): {
    registered: boolean;
    myInstanceId: string | null;
    activeInstanceCount: number;
    contendingInstanceCount: number;
    myParallelLimit: number;
    config: CoordinatorConfig | null;
    instances: InstanceInfo[];
  } {
    if (!this.state) {
      const runtimeConfig = getRuntimeConfig();
      return {
        registered: false,
        myInstanceId: null,
        activeInstanceCount: 1,
        contendingInstanceCount: 1,
        myParallelLimit: runtimeConfig.totalMaxLlm,
        config: null,
        instances: [],
      };
    }

    return {
      registered: true,
      myInstanceId: this.state.myInstanceId,
      activeInstanceCount: this.getActiveInstanceCount(),
      contendingInstanceCount: this.getContendingInstanceCount(),
      myParallelLimit: this.getMyParallelLimit(),
      config: this.state.config,
      instances: this.getActiveInstances(),
    };
  }

  /**
   * 初期化済みか確認
   * @summary 初期化確認
   */
  isInitialized(): boolean {
    return this.state !== null;
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private generateInstanceId(sessionId: string): string {
    const timestamp = this.nowProvider().toString(36);
    const randomSuffix = randomBytes(4).toString("hex");
    return `sess-${sessionId.slice(0, 8)}-pid${pid}-${timestamp}-${randomSuffix}`;
  }

  private isContendingInstance(info: InstanceInfo): boolean {
    const activeModels = Array.isArray(info.activeModels) ? info.activeModels.length : 0;
    const activeRequests = Math.max(0, Math.trunc(info.activeRequestCount || 0));
    const activeLlm = Math.max(0, Math.trunc(info.activeLlmCount || 0));
    const pendingTasks = Math.max(0, Math.trunc(info.pendingTaskCount || 0));
    return activeModels > 0 || activeRequests > 0 || activeLlm > 0 || pendingTasks > 0;
  }

  private registerShutdownHooks(): void {
    const forceHeartbeatWrite = (): void => {
      if (!this.state) return;
      this.updateHeartbeat();
    };

    process.once("SIGTERM", () => {
      forceHeartbeatWrite();
      this.unregisterInstance();
      process.exit(0);
    });

    process.once("SIGINT", () => {
      forceHeartbeatWrite();
      this.unregisterInstance();
      process.exit(0);
    });

    process.once("beforeExit", () => {
      if (this.state) {
        forceHeartbeatWrite();
      }
    });
  }

  // ========================================================================
  // Database Operations
  // ========================================================================

  private upsertInstance(info: InstanceInfo): void {
    const stmt = this.getStmt(this.stmtUpsertInstance, `
      INSERT INTO instances 
        (instance_id, pid, session_id, started_at, last_heartbeat, cwd,
         active_models_json, pending_task_count, active_request_count, active_llm_count)
      VALUES 
        (@instanceId, @pid, @sessionId, @startedAt, @lastHeartbeat, @cwd,
         @activeModelsJson, @pendingTaskCount, @activeRequestCount, @activeLlmCount)
      ON CONFLICT(instance_id) DO UPDATE SET
        last_heartbeat = excluded.last_heartbeat,
        active_models_json = excluded.active_models_json,
        pending_task_count = excluded.pending_task_count,
        active_request_count = excluded.active_request_count,
        active_llm_count = excluded.active_llm_count
    `);
    this.stmtUpsertInstance = stmt;
    
    stmt.run({
      instanceId: info.instanceId,
      pid: info.pid,
      sessionId: info.sessionId,
      startedAt: info.startedAt,
      lastHeartbeat: info.lastHeartbeat,
      cwd: info.cwd,
      activeModelsJson: JSON.stringify(info.activeModels),
      pendingTaskCount: info.pendingTaskCount ?? 0,
      activeRequestCount: info.activeRequestCount ?? 0,
      activeLlmCount: info.activeLlmCount ?? 0,
    });
  }

  private getInstance(instanceId: string): InstanceInfo | null {
    const stmt = this.getStmt(this.stmtGetInstance, 
      "SELECT * FROM instances WHERE instance_id = @instanceId");
    this.stmtGetInstance = stmt;
    
    const row = stmt.get({ instanceId }) as Record<string, unknown> | undefined;
    return row ? this.rowToInstanceInfo(row) : null;
  }

  private getActiveInstancesInternal(cutoff: string): InstanceInfo[] {
    const stmt = this.getStmt(this.stmtGetActiveInstances,
      "SELECT * FROM instances WHERE last_heartbeat > @cutoff");
    this.stmtGetActiveInstances = stmt;
    
    const rows = stmt.all({ cutoff }) as Record<string, unknown>[];
    return rows.map((row) => this.rowToInstanceInfo(row));
  }

  private updateHeartbeatInternal(instanceId: string, heartbeat: string): void {
    const stmt = this.getStmt(this.stmtUpdateHeartbeat, `
      UPDATE instances SET last_heartbeat = @heartbeat 
      WHERE instance_id = @instanceId
    `);
    this.stmtUpdateHeartbeat = stmt;
    stmt.run({ instanceId, heartbeat });
  }

  private deleteInstance(instanceId: string): void {
    const stmt = this.getStmt(this.stmtDeleteInstance,
      "DELETE FROM instances WHERE instance_id = @instanceId");
    this.stmtDeleteInstance = stmt;
    stmt.run({ instanceId });
  }

  private deleteExpiredInstances(timeoutMs: number): void {
    const cutoff = new Date(timestampMs() - timeoutMs).toISOString();
    const stmt = this.getStmt(this.stmtDeleteExpired,
      "DELETE FROM instances WHERE last_heartbeat <= @cutoff");
    this.stmtDeleteExpired = stmt;
    stmt.run({ cutoff });
  }

  private updateActiveModels(instanceId: string, activeModels: ActiveModelInfo[]): void {
    const stmt = this.getStmt(this.stmtUpdateActiveModels, `
      UPDATE instances 
      SET active_models_json = @activeModelsJson, last_heartbeat = @heartbeat
      WHERE instance_id = @instanceId
    `);
    this.stmtUpdateActiveModels = stmt;
    stmt.run({
      instanceId,
      activeModelsJson: JSON.stringify(activeModels),
      heartbeat: timestampNow(),
    });
  }

  private updateWorkloadInternal(instanceId: string, pendingTaskCount: number, avgLatencyMs?: number): void {
    const stmt = this.getStmt(this.stmtUpdateWorkload, `
      UPDATE instances 
      SET pending_task_count = @pendingTaskCount,
          avg_latency_ms = @avgLatencyMs,
          last_heartbeat = @heartbeat
      WHERE instance_id = @instanceId
    `);
    this.stmtUpdateWorkload = stmt;
    stmt.run({
      instanceId,
      pendingTaskCount,
      avgLatencyMs: avgLatencyMs ?? null,
      heartbeat: timestampNow(),
    });
  }

  private updateRuntimeUsageInternal(instanceId: string, activeRequestCount: number, activeLlmCount: number): void {
    const stmt = this.getStmt(this.stmtUpdateRuntimeUsage, `
      UPDATE instances 
      SET active_request_count = @activeRequestCount,
          active_llm_count = @activeLlmCount,
          last_heartbeat = @heartbeat
      WHERE instance_id = @instanceId
    `);
    this.stmtUpdateRuntimeUsage = stmt;
    stmt.run({
      instanceId,
      activeRequestCount,
      activeLlmCount,
      heartbeat: timestampNow(),
    });
  }

  private getStmt(
    cached: import("better-sqlite3").Statement | null,
    sql: string
  ): import("better-sqlite3").Statement {
    if (cached) return cached;
    return this.db.prepare(sql);
  }

  private rowToInstanceInfo(row: Record<string, unknown>): InstanceInfo {
    return {
      instanceId: row.instance_id as string,
      pid: row.pid as number,
      sessionId: row.session_id as string,
      startedAt: row.started_at as string,
      lastHeartbeat: row.last_heartbeat as string,
      cwd: row.cwd as string,
      activeModels: JSON.parse(row.active_models_json as string || "[]") as ActiveModelInfo[],
      pendingTaskCount: row.pending_task_count as number | undefined,
      activeRequestCount: row.active_request_count as number | undefined,
      activeLlmCount: row.active_llm_count as number | undefined,
    };
  }
}

// シングルトン
let coordinatorInstance: SQLiteCoordinator | null = null;

/**
 * SQLiteコーディネータを作成
 * @summary コーディネータ作成
 */
export function createSQLiteCoordinator(): SQLiteCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new SQLiteCoordinator();
  }
  return coordinatorInstance;
}

/**
 * テスト用にコーディネータをリセット
 * @summary コーディネータリセット
 */
export function resetSQLiteCoordinator(): void {
  if (coordinatorInstance) {
    coordinatorInstance.unregisterInstance();
    coordinatorInstance = null;
  }
}
