/**
 * @abdd.meta
 * path: .pi/lib/coordination/cross-instance-coordinator.ts
 * role: 複数のpiインスタンス間でLLM並列数制限を調整するコーディネータ
 * why: プロセス間でリソース競合を防ぎ、全体の並列数を適切に管理するため
 * related: .pi/lib/runtime-config.ts, .pi/lib/adaptive-total-limit.ts
 * public_api: ActiveModelInfo, InstanceInfo, CoordinatorConfig, CoordinatorInternalState, resetHeartbeatDebounce
 * invariants: totalMaxLlmはgetRuntimeConfigおよびadaptiveTotal-limitの計算結果に依存する
 * side_effects: ~/.pi/runtime/pi-coordinator.dbへの読み書き
 * failure_modes: データベース接続エラー時は例外をスロー
 * @abdd.explain
 * overview: SQLite + WALモードを使用し、複数インスタンスの生存状態と負荷状況を管理する
 * what_it_does:
 *   - 設定値をruntime-config.tsから集約し、デフォルト設定を生成する
 *   - SQLiteデータベースでインスタンス情報を管理する
 *   - ハートビートによる生存確認を行う
 *   - 並列数制限の動的計算を行う
 * why_it_exists:
 *   - インスタンス間の設定の一貫性を保つため
 *   - ファイルベースのロック競合問題を解決するため
 *   - ACID保証でデータ整合性を確保するため
 * scope:
 *   in: 環境変数PI_RUNTIME_DIR, RuntimeConfig, getAdaptiveTotalLlm
 * out: CoordinatorConfig, 並列数制限、インスタンス一覧
 */

import { pid } from "node:process";
import { randomBytes } from "node:crypto";
import type { PiDatabase } from "../storage/sqlite-db.js";
import { getDatabase } from "../storage/sqlite-db.js";
import { timestampNow, timestampMs } from "../storage/sqlite-schema.js";
import { getRuntimeConfig } from "../runtime-config.js";
import { getAdaptiveTotalMaxLlm } from "../adaptive-total-limit.js";

// ============================================================================
// Types
// ============================================================================

/**
 * アクティブなモデルの情報を表すインターフェース
 * @summary アクティブモデル情報
 */
export interface ActiveModelInfo {
  provider: string;
  model: string;
  since: string;
}

/**
 * インスタンスの情報を表す
 * @summary インスタンス情報
 * @param instanceId - インスタンスID
 */
export interface InstanceInfo {
  instanceId: string;
  pid: number;
  sessionId: string;
  startedAt: string;
  lastHeartbeat: string;
  cwd: string;
  activeModels: ActiveModelInfo[];
  activeRequestCount?: number;
  activeLlmCount?: number;
  pendingTaskCount?: number;
  avgLatencyMs?: number;
  lastTaskCompletedAt?: string;
}

/**
 * コーディネータの設定を表すインターフェース
 * @summary 設定定義
 */
export interface CoordinatorConfig {
  totalMaxLlm: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
}

/**
 * コーディネータの内部状態を表すインターフェース
 * @summary 内部状態定義
 */
export interface CoordinatorInternalState {
  myInstanceId: string;
  mySessionId: string;
  myStartedAt: string;
  config: CoordinatorConfig;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Get default config from centralized RuntimeConfig.
 * This ensures consistency with other layers.
 */
function getDefaultConfig(): CoordinatorConfig {
  const runtimeConfig = getRuntimeConfig();
  const adaptiveTotalMaxLlm = getAdaptiveTotalMaxLlm(runtimeConfig.totalMaxLlm);
  return {
    totalMaxLlm: adaptiveTotalMaxLlm,
    heartbeatIntervalMs: runtimeConfig.heartbeatIntervalMs,
    heartbeatTimeoutMs: runtimeConfig.heartbeatTimeoutMs,
  };
}

// ============================================================================
// Coordinator Class
// ============================================================================

/**
 * SQLiteベースのコーディネータ
 * @summary インスタンス間調整コーディネータ
 */
export class Coordinator {
  private db: PiDatabase;
  private state: CoordinatorInternalState | null = null;
  private nowProvider: () => number = () => Date.now();
  
  // プリペアドステートメント（キャッシュ用）
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

  /**
   * PiDatabase.transaction の互換ヘルパー
   * SQLite移行時にテストモックが「関数を返す実装」を使っていても吸収する。
   */
  private inTransaction<T>(fn: () => T): T {
    const result = this.db.transaction(fn) as T | (() => T);
    if (typeof result === "function") {
      return result();
    }
    return result;
  }

  // =======================================================================
  // Public API
  // =======================================================================

  /**
   * インスタンスを登録
   * @summary インスタンス登録
   */
  registerInstance(
    sessionId: string,
    cwd: string,
    configOverrides?: Partial<CoordinatorConfig>,
  ): void {
    if (this.state) {
      this.updateHeartbeat();
      return;
    }

    const defaults = getDefaultConfig();
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

    this.inTransaction(() => {
      this.upsertInstance(info);
    });

    // ハートビートタイマー開始
    const heartbeatTimer = setInterval(() => {
      this.updateHeartbeat();
      this.cleanupDeadInstances();
    }, config.heartbeatIntervalMs);
    heartbeatTimer.unref?.();

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

    this.inTransaction(() => {
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
    this.inTransaction(() => {
      this.updateHeartbeatInternal(this.state!.myInstanceId, now);
    });
  }

  /**
   * 期限切れインスタンスを削除
   * @summary 期限切れ削除
   */
  cleanupDeadInstances(): void {
    if (!this.state) return;
    
    this.inTransaction(() => {
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
    return this.inTransaction(() => {
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
    
    this.inTransaction(() => {
      const current = this.getInstance(this.state!.myInstanceId);
      if (!current) return;
      
      const existing = current.activeModels.find(
        (m) => m.provider === normalizedProvider && m.model === normalizedModel,
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
    
    this.inTransaction(() => {
      const current = this.getInstance(this.state!.myInstanceId);
      if (!current) return;
      
      current.activeModels = current.activeModels.filter(
        (m) => !(m.provider === normalizedProvider && m.model === normalizedModel),
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

  // =======================================================================
  // Private Methods
  // =======================================================================

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

  // =======================================================================
  // Database Operations
  // =======================================================================

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
    sql: string,
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

// ============================================================================
// Singleton Instance & Exported Functions
// ============================================================================

let coordinatorInstance: Coordinator | null = null;

/**
 * コーディネータインスタンスを取得（遅延初期化）
 * @summary コーディネータ取得
 * @returns Coordinatorインスタンス
 */
function getCoordinator(): Coordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new Coordinator();
  }
  return coordinatorInstance;
}

// Export functions that delegate to the singleton

export function registerInstance(
  sessionId: string,
  cwd: string,
  configOverrides?: Partial<CoordinatorConfig>,
): void {
  getCoordinator().registerInstance(sessionId, cwd, configOverrides);
}

export function unregisterInstance(): void {
  getCoordinator().unregisterInstance();
}

export function updateHeartbeat(): void {
  getCoordinator().updateHeartbeat();
}

export function cleanupDeadInstances(): void {
  getCoordinator().cleanupDeadInstances();
}

export function getActiveInstanceCount(): number {
  return getCoordinator().getActiveInstanceCount();
}

export function getActiveInstances(): InstanceInfo[] {
  return getCoordinator().getActiveInstances();
}

export function getMyParallelLimit(): number {
  return getCoordinator().getMyParallelLimit();
}

export function getContendingInstanceCount(): number {
  return getCoordinator().getContendingInstanceCount();
}

export function setActiveModel(provider: string, model: string): void {
  getCoordinator().setActiveModel(provider, model);
}

export function clearActiveModel(provider: string, model: string): void {
  getCoordinator().clearActiveModel(provider, model);
}

export function clearAllActiveModels(): void {
  getCoordinator().clearAllActiveModels();
}

export function updateWorkloadInfo(pendingTaskCount: number, avgLatencyMs?: number): void {
  getCoordinator().updateWorkloadInfo(pendingTaskCount, avgLatencyMs);
}

export function updateRuntimeUsage(activeRequestCount: number, activeLlmCount: number): void {
  getCoordinator().updateRuntimeUsage(activeRequestCount, activeLlmCount);
}

export function getCoordinatorStatus(): {
  registered: boolean;
  myInstanceId: string | null;
  activeInstanceCount: number;
  contendingInstanceCount: number;
  myParallelLimit: number;
  config: CoordinatorConfig | null;
  instances: InstanceInfo[];
} {
  return getCoordinator().getCoordinatorStatus();
}

export function isInitialized(): boolean {
  return getCoordinator().isInitialized();
}

/**
 * コーディネータが初期化済みかどうか（エイリアス）
 * @summary 初期化確認（エイリアス）
 * @returns 初期化済みの場合はtrue
 */
export function isCoordinatorInitialized(): boolean {
  return isInitialized();
}

/**
 * テスト用にコーディネータをリセット
 * @summary コーディネータリセット
 */
export function resetCoordinator(): void {
  if (coordinatorInstance) {
    coordinatorInstance.unregisterInstance();
    coordinatorInstance = null;
  }
}

/**
 * @summary ハートビートdebounce状態をリセット（テスト用）
 * @deprecated SQLite版では不要
 */
export function resetHeartbeatDebounce(): void {
  // SQLite版では不要
}

// ============================================================================
// Environment Overrides
// ============================================================================

/**
 * 環境変数から設定オーバーライドを取得
 * @summary 環境変数オーバーライド取得
 * @returns 設定オーバーライド
 */
export function getEnvOverrides(): Partial<CoordinatorConfig> {
  const overrides: Partial<CoordinatorConfig> = {};

  const totalMaxLlm = process.env.PI_TOTAL_MAX_LLM;
  if (totalMaxLlm) {
    const parsed = parseInt(totalMaxLlm, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      overrides.totalMaxLlm = parsed;
    }
  }

  const heartbeatIntervalMs = process.env.PI_HEARTBEAT_INTERVAL_MS;
  if (heartbeatIntervalMs) {
    const parsed = parseInt(heartbeatIntervalMs, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      overrides.heartbeatIntervalMs = parsed;
    }
  }

  const heartbeatTimeoutMs = process.env.PI_HEARTBEAT_TIMEOUT_MS;
  if (heartbeatTimeoutMs) {
    const parsed = parseInt(heartbeatTimeoutMs, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      overrides.heartbeatTimeoutMs = parsed;
    }
  }

  return overrides;
}

// ============================================================================
// Model-specific Functions
// ============================================================================

/**
 * 特定モデルのアクティブインスタンス数を取得
 * @summary モデル別アクティブ数取得
 * @param provider - プロバイダ名
 * @param model - モデル名
 * @returns アクティブインスタンス数
 */
function getActiveInstancesForModel(provider: string, model: string): number {
  const instances = getActiveInstances();
  let count = 0;
  
  for (const inst of instances) {
    for (const active of inst.activeModels) {
      if (matchesModelPattern(active.provider, provider) && 
          matchesModelPattern(active.model, model)) {
        count++;
        break;
      }
    }
  }
  
  return Math.max(1, count);
}

/**
 * モデル名パターンが一致するかチェック
 * @summary モデルパターンマッチ
 * @param pattern - パターン
 * @param value - 比較対象
 * @returns 一致する場合はtrue
 */
function matchesModelPattern(pattern: string, value: string): boolean {
  const normalizedPattern = pattern.toLowerCase();
  const normalizedValue = value.toLowerCase();
  
  // Exact match
  if (normalizedPattern === normalizedValue) return true;
  
  // Prefix match
  if (normalizedValue.startsWith(normalizedPattern)) return true;
  if (normalizedPattern.startsWith(normalizedValue)) return true;
  
  return false;
}

/**
 * モデルごとの並列数制限を取得
 * @summary モデル別並列数取得
 * @param provider - プロバイダ名
 * @param model - モデル名
 * @param baseLimit - 基本制限値
 * @returns モデル別並列数制限
 */
export function getModelParallelLimit(
  provider: string,
  model: string,
  baseLimit: number,
): number {
  const activeCount = getActiveInstancesForModel(provider, model);
  return Math.max(1, Math.floor(baseLimit / activeCount));
}

/**
 * モデル使用状況サマリーを取得
 * @summary モデル使用状況サマリー
 * @returns モデル使用状況
 */
export function getModelUsageSummary(): {
  models: Array<{
    provider: string;
    model: string;
    instanceCount: number;
  }>;
  instances: InstanceInfo[];
} {
  const instances = getActiveInstances();
  const modelMap = new Map<string, { provider: string; model: string; count: number }>();

  for (const inst of instances) {
    for (const active of inst.activeModels) {
      const key = `${active.provider}:${active.model}`;
      const existing = modelMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        modelMap.set(key, {
          provider: active.provider,
          model: active.model,
          count: 1,
        });
      }
    }
  }

  const models = Array.from(modelMap.values()).map((m) => ({
    provider: m.provider,
    model: m.model,
    instanceCount: m.count,
  }));

  return { models, instances };
}
