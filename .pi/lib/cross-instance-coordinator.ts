/**
 * @abdd.meta
 * path: .pi/lib/cross-instance-coordinator.ts
 * role: 複数のpiインスタンス間でLLM並列数を制御するコーディネーター
 * why: 複数インスタンスが同時実行する際、全インスタンス合計のLLM並列数を制限し、リソース枯渇を防ぐため
 * related: runtime-config.ts, instance-manager.ts, session-manager.ts, lock-manager.ts
 * public_api: ActiveModelInfo, InstanceInfo, CoordinatorConfig, CoordinatorInternalState, getDefaultConfig
 * invariants:
 *   - インスタンスIDは {sessionId}-{pid} 形式で一意に生成される
 *   - ハートビート間隔はタイムアウト未満である
 *   - totalMaxLlmはRuntimeConfigから取得され全インスタンス共通
 * side_effects:
 *   - ~/.pi/runtime/instances/ 配下へのロックファイル作成・削除
 *   - ~/.pi/runtime/coordinator.json の読み書き
 *   - ハートビート用setIntervalタイマーの起動
 * failure_modes:
 *   - ロックファイル書き込み権限不足によるインスタンス登録失敗
 *   - ディスク容量不足による状態ファイル更新不可
 *   - ゾンビロックファイル（異常終了時の残留）
 * @abdd.explain
 * overview: ファイルベースのロックとハートビート機構で、複数piインスタンスの活動を検知・調整する
 * what_it_does:
 *   - 自インスタンスの情報を~/.pi/runtime/instances/にロックファイルとして登録
 *   - 定期的なハートビートでアクティブ状態を通知
 *   - 全アクティブインスタンスを集計し、LLM並列数の割り当てを判断
 *   - タイムアウトしたインスタンスのロックファイルを削除
 * why_it_exists:
 *   - 単一マシンで複数piセッション実行時のAPIレート制限対応
 *   - ユーザーが意識せず複数インスタンスを起動してもリソース過負荷を防ぐ
 *   - インスタンス間でアクティブモデル情報を共有し、競合を回避
 * scope:
 *   in: RuntimeConfigから取得する設定値（totalMaxLlm, heartbeatIntervalMs, heartbeatTimeoutMs）
 *   out: アクティブインスタンス一覧、現在利用可能なLLM並列スロット数
 */

/**
 * Cross-Instance Coordinator
 *
 * Coordinates LLM parallelism limits across multiple pi instances.
 * Uses file-based locking and heartbeat to detect active instances.
 *
 * Directory structure:
 * ~/.pi/runtime/
 * ├── instances/
 * │   ├── {sessionId}-{pid}.lock
 * │   └── ...
 * └── coordinator.json
 *
 * Configuration:
 * Uses centralized RuntimeConfig from runtime-config.ts for consistency
 * across all layers (stable/default profiles).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pid } from "node:process";
import {
  getRuntimeConfig,
  type RuntimeConfig,
} from "./runtime-config.js";

// ============================================================================
// Types
// ============================================================================

 /**
  * アクティブなモデル情報を表すインターフェース
  * @param provider - モデルプロバイダー名
  * @param model - モデル識別子
  * @param since - モデルがアクティブになった時刻
  */
export interface ActiveModelInfo {
  provider: string;
  model: string;
  since: string;
}

 /**
  * インスタンスの情報を表す
  * @param instanceId - インスタンスID
  * @param pid - プロセスID
  * @param sessionId - セッションID
  * @param startedAt - 開始時刻
  * @param lastHeartbeat - 最後のハートビート時刻
  * @param cwd - カレントワーキングディレクトリ
  * @param activeModels - アクティブなモデルの情報
  * @param pendingTaskCount - 保留中のタスク数
  * @param avgLatencyMs - 平均レイテンシ（ミリ秒）
  * @param lastTaskCompletedAt - 最後のタスク完了時刻
  */
export interface InstanceInfo {
  instanceId: string;
  pid: number;
  sessionId: string;
  startedAt: string;
  lastHeartbeat: string;
  cwd: string;
  activeModels: ActiveModelInfo[];
  pendingTaskCount?: number;
  avgLatencyMs?: number;
  lastTaskCompletedAt?: string;
}

 /**
  * クロスインスタンスコーディネーターの設定
  * @param totalMaxLlm 全インスタンスで許可されるLLMの最大数
  * @param heartbeatIntervalMs ハートビート送信間隔（ミリ秒）
  * @param heartbeatTimeoutMs ハートビートタイムアウト時間（ミリ秒）
  */
export interface CoordinatorConfig {
  totalMaxLlm: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
}

 /**
  * コーディネーターの内部状態
  * @param myInstanceId 自インスタンスID
  * @param mySessionId 自セッションID
  * @param myStartedAt 開始日時
  * @param config コーディネーター設定
  * @param heartbeatTimer ハートビートタイマー
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
  return {
    totalMaxLlm: runtimeConfig.totalMaxLlm,
    heartbeatIntervalMs: runtimeConfig.heartbeatIntervalMs,
    heartbeatTimeoutMs: runtimeConfig.heartbeatTimeoutMs,
  };
}

/**
 * Legacy constant for backward compatibility.
 * @deprecated Use getRuntimeConfig() instead.
 */
const DEFAULT_CONFIG: CoordinatorConfig = {
  totalMaxLlm: 6,  // Will be overridden by runtime-config
  heartbeatIntervalMs: 15_000,
  heartbeatTimeoutMs: 60_000,
};

const COORDINATOR_DIR = join(homedir(), ".pi", "runtime");
const INSTANCES_DIR = join(COORDINATOR_DIR, "instances");
const CONFIG_FILE = join(COORDINATOR_DIR, "coordinator.json");

// ============================================================================
// State
// ============================================================================

let state: CoordinatorInternalState | null = null;

// ============================================================================
// Utilities
// ============================================================================

function ensureDirs(): void {
  if (!existsSync(COORDINATOR_DIR)) {
    mkdirSync(COORDINATOR_DIR, { recursive: true });
  }
  if (!existsSync(INSTANCES_DIR)) {
    mkdirSync(INSTANCES_DIR, { recursive: true });
  }
}

function generateInstanceId(sessionId: string): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `sess-${sessionId.slice(0, 8)}-pid${pid}-${timestamp}-${randomSuffix}`;
}

function parseLockFile(filename: string): InstanceInfo | null {
  try {
    const content = readFileSync(join(INSTANCES_DIR, filename), "utf-8");
    const parsed = JSON.parse(content) as InstanceInfo;
    return parsed;
  } catch {
    return null;
  }
}

function isInstanceAlive(info: InstanceInfo, nowMs: number, timeoutMs: number): boolean {
  const lastHeartbeat = new Date(info.lastHeartbeat).getTime();
  return nowMs - lastHeartbeat < timeoutMs;
}

function loadConfig(): CoordinatorConfig {
  // Start with centralized config
  const defaults = getDefaultConfig();

  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(content);
      return {
        totalMaxLlm: parsed.totalMaxLlm ?? defaults.totalMaxLlm,
        heartbeatIntervalMs: parsed.heartbeatIntervalMs ?? defaults.heartbeatIntervalMs,
        heartbeatTimeoutMs: parsed.heartbeatTimeoutMs ?? defaults.heartbeatTimeoutMs,
      };
    }
  } catch {
    // ignore
  }
  return defaults;
}

// ============================================================================
// Public API
// ============================================================================

 /**
  * インスタンスを登録してハートビートを開始
  * @param sessionId - piセッションID
  * @param cwd - カレントワーキングディレクトリ
  * @param configOverrides - オプションの設定上書き（環境変数から）
  * @returns なし
  */
export function registerInstance(
  sessionId: string,
  cwd: string,
  configOverrides?: Partial<CoordinatorConfig>,
): void {
  if (state) {
    // Already registered, just update heartbeat
    updateHeartbeat();
    return;
  }

  ensureDirs();

  // Priority: runtime-config defaults > file config > env overrides
  const runtimeConfig = getRuntimeConfig();
  const defaults: CoordinatorConfig = {
    totalMaxLlm: runtimeConfig.totalMaxLlm,
    heartbeatIntervalMs: runtimeConfig.heartbeatIntervalMs,
    heartbeatTimeoutMs: runtimeConfig.heartbeatTimeoutMs,
  };
  const fileConfig = loadConfig();
  const config = { ...defaults, ...fileConfig, ...configOverrides };

  const instanceId = generateInstanceId(sessionId);
  const now = new Date().toISOString();

  const info: InstanceInfo = {
    instanceId,
    pid,
    sessionId,
    startedAt: now,
    lastHeartbeat: now,
    cwd,
    activeModels: [],
  };

  // Write initial lock file
  const lockFile = join(INSTANCES_DIR, `${instanceId}.lock`);
  writeFileSync(lockFile, JSON.stringify(info, null, 2));

  // Start heartbeat
  const heartbeatTimer = setInterval(() => {
    updateHeartbeat();
    cleanupDeadInstances();
  }, config.heartbeatIntervalMs);

  // Don't prevent process exit
  heartbeatTimer.unref();

  state = {
    myInstanceId: instanceId,
    mySessionId: sessionId,
    myStartedAt: now,
    config,
    heartbeatTimer,
  };
}

 /**
  * このPIインスタンスの登録を解除する
  * @returns なし
  */
export function unregisterInstance(): void {
  if (!state) return;

  // Stop heartbeat
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
  }

  // Remove lock file
  try {
    const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);
    if (existsSync(lockFile)) {
      unlinkSync(lockFile);
    }
  } catch {
    // ignore
  }

  state = null;
}

 /**
  * このインスタンスのハートビートを更新する
  * @returns 戻り値なし
  */
export function updateHeartbeat(): void {
  if (!state) return;

  try {
    const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);
    const content = readFileSync(lockFile, "utf-8");
    const info = JSON.parse(content) as InstanceInfo;
    info.lastHeartbeat = new Date().toISOString();
    writeFileSync(lockFile, JSON.stringify(info, null, 2));
  } catch {
    // If lock file is gone, recreate it preserving original startedAt
    ensureDirs();
    const info: InstanceInfo = {
      instanceId: state.myInstanceId,
      pid,
      sessionId: state.mySessionId,
      startedAt: state.myStartedAt,
      lastHeartbeat: new Date().toISOString(),
      cwd: process.cwd(),
      activeModels: [],
    };
    const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);
    writeFileSync(lockFile, JSON.stringify(info, null, 2));
  }
}

 /**
  * 無効なインスタンスをクリーンアップする
  * @returns {void}
  */
export function cleanupDeadInstances(): void {
  if (!state) return;

  ensureDirs();
  const nowMs = Date.now();
  const files = readdirSync(INSTANCES_DIR).filter((f) => f.endsWith(".lock"));

  for (const file of files) {
    const info = parseLockFile(file);
    if (!info) {
      // Corrupted lock file, remove it
      try {
        unlinkSync(join(INSTANCES_DIR, file));
      } catch {
        // ignore
      }
      continue;
    }

    // Skip self
    if (info.instanceId === state.myInstanceId) continue;

    // Remove dead instances
    if (!isInstanceAlive(info, nowMs, state.config.heartbeatTimeoutMs)) {
      try {
        unlinkSync(join(INSTANCES_DIR, file));
      } catch {
        // ignore
      }
    }
  }
}

 /**
  * アクティブなインスタンス数を取得
  * @returns アクティブなインスタンス数（最小1）
  */
export function getActiveInstanceCount(): number {
  if (!state) {
    // Not registered yet, assume single instance
    return 1;
  }

  ensureDirs();
  const nowMs = Date.now();
  const files = readdirSync(INSTANCES_DIR).filter((f) => f.endsWith(".lock"));

  let count = 0;
  for (const file of files) {
    const info = parseLockFile(file);
    if (info && isInstanceAlive(info, nowMs, state.config.heartbeatTimeoutMs)) {
      count++;
    }
  }

  return Math.max(1, count);
}

 /**
  * アクティブなインスタンス情報を取得する
  *
  * @returns アクティブなインスタンス情報の配列
  */
export function getActiveInstances(): InstanceInfo[] {
  if (!state) {
    return [];
  }

  ensureDirs();
  const nowMs = Date.now();
  const files = readdirSync(INSTANCES_DIR).filter((f) => f.endsWith(".lock"));

  const instances: InstanceInfo[] = [];
  for (const file of files) {
    const info = parseLockFile(file);
    if (info && isInstanceAlive(info, nowMs, state.config.heartbeatTimeoutMs)) {
      instances.push(info);
    }
  }

  return instances;
}

 /**
  * このインスタンスの並列処理制限を取得する
  * @returns このインスタンスの最大LLM並列呼び出し数
  */
export function getMyParallelLimit(): number {
  if (!state) {
    return 1;
  }

  const activeCount = getActiveInstanceCount();
  const baseLimit = Math.max(1, Math.floor(state.config.totalMaxLlm / activeCount));

  return baseLimit;
}

 /**
  * 保留タスク数に基づき動的に並列数を制限する。
  * @param myPendingTasks - 自インスタンスの現在の保留タスク数
  * @returns 調整後の並列実行数
  */
export function getDynamicParallelLimit(myPendingTasks: number = 0): number {
  if (!state) {
    return 1;
  }

  const instances = getActiveInstances();
  const activeCount = instances.length;

  if (activeCount === 0) {
    return state.config.totalMaxLlm;
  }

  // Calculate total pending tasks across all instances
  let totalPending = 0;
  const pendingByInstance: Map<string, number> = new Map();

  for (const inst of instances) {
    const pending = inst.pendingTaskCount ?? 0;
    totalPending += pending;
    pendingByInstance.set(inst.instanceId, pending);
  }

  // If no one has pending tasks, use base distribution
  if (totalPending === 0) {
    return Math.max(1, Math.floor(state.config.totalMaxLlm / activeCount));
  }

  // Calculate this instance's share based on inverse workload
  const myPending = pendingByInstance.get(state.myInstanceId) ?? myPendingTasks;

  // Inverse proportion: instances with fewer tasks get more slots
  const totalInverseWorkload = instances.reduce((sum, inst) => {
    const pending = inst.pendingTaskCount ?? 0;
    // Add 1 to avoid division by zero and smooth distribution
    return sum + 1 / (pending + 1);
  }, 0);

  const myInverseWorkload = 1 / (myPending + 1);
  const myShare = myInverseWorkload / totalInverseWorkload;

  // Calculate slot allocation
  const allocatedSlots = Math.round(state.config.totalMaxLlm * myShare);

  // Ensure minimum of 1 slot
  return Math.max(1, Math.min(allocatedSlots, state.config.totalMaxLlm));
}

 /**
  * ワークスチーリングを試みるべきか判定
  * @returns アイドルでビジーなインスタンスがある場合true
  */
export function shouldAttemptWorkStealing(): boolean {
  if (!state) {
    return false;
  }

  const myInstanceId = state.myInstanceId;
  const instances = getActiveInstances();
  const myInfo = instances.find((i) => i.instanceId === myInstanceId);

  // I'm idle (no pending tasks)
  const imIdle = (myInfo?.pendingTaskCount ?? 0) === 0;

  // There are busy instances
  const hasBusyInstance = instances.some(
    (i) => i.instanceId !== myInstanceId && (i.pendingTaskCount ?? 0) > 2
  );

  return imIdle && hasBusyInstance;
}

 /**
  * ワークスチーリングの候補インスタンスを取得
  * @param topN - 返す候補の数
  * @returns ワークロード降順でソートされたインスタンスIDのリスト
  */
export function getWorkStealingCandidates(topN: number = 3): string[] {
  if (!state) {
    return [];
  }

  const instances = getActiveInstances();

  // Filter out self and sort by pending tasks (descending)
  return instances
    .filter((i) => i.instanceId !== state!.myInstanceId)
    .filter((i) => (i.pendingTaskCount ?? 0) > 0)
    .sort((a, b) => (b.pendingTaskCount ?? 0) - (a.pendingTaskCount ?? 0))
    .slice(0, topN)
    .map((i) => i.instanceId);
}

 /**
  * ワークロード情報を更新する
  * @param pendingTaskCount - 現在の保留タスク数
  * @param avgLatencyMs - 平均タスク待機時間
  * @returns 戻り値なし
  */
export function updateWorkloadInfo(pendingTaskCount: number, avgLatencyMs?: number): void {
  if (!state) {
    return;
  }

  const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);

  try {
    const existing: InstanceInfo = {
      instanceId: state.myInstanceId,
      pid,
      sessionId: state.mySessionId,
      startedAt: state.myStartedAt,
      lastHeartbeat: new Date().toISOString(),
      cwd: process.cwd(),
      activeModels: [], // Will be preserved if file exists
      pendingTaskCount,
      avgLatencyMs,
      lastTaskCompletedAt: avgLatencyMs ? new Date().toISOString() : undefined,
    };

    // Preserve existing data
    if (existsSync(lockFile)) {
      try {
        const content = readFileSync(lockFile, "utf-8");
        const parsed = JSON.parse(content) as InstanceInfo;
        existing.activeModels = parsed.activeModels ?? [];
        if (!avgLatencyMs && parsed.avgLatencyMs) {
          existing.avgLatencyMs = parsed.avgLatencyMs;
        }
        if (!existing.lastTaskCompletedAt && parsed.lastTaskCompletedAt) {
          existing.lastTaskCompletedAt = parsed.lastTaskCompletedAt;
        }
      } catch {
        // Ignore parse errors
      }
    }

    writeFileSync(lockFile, JSON.stringify(existing, null, 2), "utf-8");
  } catch {
    // Ignore write errors in heartbeat
  }
}

 /**
  * コーディネーターの詳細ステータスを取得する
  * @returns 登録状態、インスタンスID、アクティブ数、並列制限、設定、インスタンス一覧を含むステータス情報
  */
export function getCoordinatorStatus(): {
  registered: boolean;
  myInstanceId: string | null;
  activeInstanceCount: number;
  myParallelLimit: number;
  config: CoordinatorConfig | null;
  instances: InstanceInfo[];
} {
  if (!state) {
    return {
      registered: false,
      myInstanceId: null,
      activeInstanceCount: 1,
      myParallelLimit: DEFAULT_CONFIG.totalMaxLlm,
      config: null,
      instances: [],
    };
  }

  const activeCount = getActiveInstanceCount();
  const myLimit = getMyParallelLimit();

  return {
    registered: true,
    myInstanceId: state.myInstanceId,
    activeInstanceCount: activeCount,
    myParallelLimit: myLimit,
    config: state.config,
    instances: getActiveInstances(),
  };
}

 /**
  * コーディネータが初期化済みか確認
  * @returns 初期化済みの場合はtrue
  */
export function isCoordinatorInitialized(): boolean {
  return state !== null;
}

 /**
  * 合計最大LLM数を取得
  * @returns 合計最大LLM数
  */
export function getTotalMaxLlm(): number {
  if (state?.config.totalMaxLlm) {
    return state.config.totalMaxLlm;
  }
  return getRuntimeConfig().totalMaxLlm;
}

 /**
  * 環境変数による設定上書きを取得
  * @returns 環境変数から読み取った設定の一部
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
// Model-Specific Instance Tracking
// ============================================================================

 /**
  * アクティブなモデルを更新します
  * @param provider プロバイダ名
  * @param model モデル名
  * @returns なし
  */
export function setActiveModel(provider: string, model: string): void {
  if (!state) return;

  try {
    const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);
    const content = readFileSync(lockFile, "utf-8");
    const info = JSON.parse(content) as InstanceInfo;

    const now = new Date().toISOString();
    const normalizedProvider = provider.toLowerCase();
    const normalizedModel = model.toLowerCase();

    // Check if already active
    const existing = info.activeModels.find(
      (m) => m.provider === normalizedProvider && m.model === normalizedModel
    );

    if (!existing) {
      info.activeModels.push({
        provider: normalizedProvider,
        model: normalizedModel,
        since: now,
      });
    }

    info.lastHeartbeat = now;
    writeFileSync(lockFile, JSON.stringify(info, null, 2));
  } catch {
    // ignore
  }
}

 /**
  * このインスタンスのアクティブなモデルを解除する。
  * @param provider プロバイダ名
  * @param model モデル名
  * @returns 戻り値なし
  */
export function clearActiveModel(provider: string, model: string): void {
  if (!state) return;

  try {
    const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);
    const content = readFileSync(lockFile, "utf-8");
    const info = JSON.parse(content) as InstanceInfo;

    const normalizedProvider = provider.toLowerCase();
    const normalizedModel = model.toLowerCase();

    info.activeModels = info.activeModels.filter(
      (m) => !(m.provider === normalizedProvider && m.model === normalizedModel)
    );

    info.lastHeartbeat = new Date().toISOString();
    writeFileSync(lockFile, JSON.stringify(info, null, 2));
  } catch {
    // ignore
  }
}

 /**
  * 全てのアクティブなモデルをクリアする。
  * @returns なし
  */
export function clearAllActiveModels(): void {
  if (!state) return;

  try {
    const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);
    const content = readFileSync(lockFile, "utf-8");
    const info = JSON.parse(content) as InstanceInfo;

    info.activeModels = [];
    info.lastHeartbeat = new Date().toISOString();
    writeFileSync(lockFile, JSON.stringify(info, null, 2));
  } catch {
    // ignore
  }
}

 /**
  * モデルを使用するアクティブなインスタンス数を取得
  * @param provider - プロバイダ名
  * @param model - モデル名（またはパターン）
  * @returns このモデルを使用するインスタンス数
  */
export function getActiveInstancesForModel(
  provider: string,
  model: string
): number {
  if (!state) {
    return 1;
  }

  const instances = getActiveInstances();
  const normalizedProvider = provider.toLowerCase();
  const normalizedModel = model.toLowerCase();

  let count = 0;
  for (const inst of instances) {
    const hasModel = inst.activeModels.some(
      (m) =>
        m.provider === normalizedProvider &&
        (m.model === normalizedModel ||
         matchesModelPattern(normalizedModel, m.model))
    );
    if (hasModel) {
      count++;
    }
  }

  return Math.max(1, count);
}

 /**
  * モデルごとの実行並列数の上限を取得
  * @param provider - プロバイダー名
  * @param model - モデル名
  * @param baseLimit - モデルの基本同時実行数
  * @returns このインスタンスの有効な上限数
  */
export function getModelParallelLimit(
  provider: string,
  model: string,
  baseLimit: number
): number {
  const activeCount = getActiveInstancesForModel(provider, model);
  return Math.max(1, Math.floor(baseLimit / activeCount));
}

/**
 * Simple pattern matching for model names.
 */
function matchesModelPattern(pattern: string, model: string): boolean {
  // Exact match
  if (pattern === model) return true;

  // Prefix match (e.g., "claude-sonnet-4" matches "claude-sonnet-4-20250514")
  if (model.startsWith(pattern)) return true;
  if (pattern.startsWith(model)) return true;

  // Glob-style match with proper regex escaping
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexPattern = escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".");
  const regex = new RegExp("^" + regexPattern + "$", "i");
  return regex.test(model);
}

 /**
  * モデル使用状況の概要を取得
  * @returns モデルごとの統計情報とインスタンス一覧を含むオブジェクト
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

// ============================================================================
// Work Stealing Support
// ============================================================================

 /**
  * ワークスティーリング用のキューエントリ
  * @param id エントリのID
  * @param toolName ツール名
  * @param priority 優先度
  * @param instanceId インスタンスID
  * @param enqueuedAt キュー登録日時
  * @param estimatedDurationMs 予想実行時間（ミリ秒）
  * @param estimatedRounds 予想ラウンド数
  */
export interface StealableQueueEntry {
  id: string;
  toolName: string;
  priority: string;
  instanceId: string;
  enqueuedAt: string;
  estimatedDurationMs?: number;
  estimatedRounds?: number;
}

 /**
  * キュー状態のブロードキャスト形式
  * @param instanceId インスタンスID
  * @param timestamp タイムスタンプ
  * @param pendingTaskCount 保留中のタスク数
  * @param avgLatencyMs 平均レイテンシ（ミリ秒）
  * @param activeOrchestrations アクティブなオーケストレーション数
  * @param stealableEntries 他インスタンスに奪取可能なエントリ一覧
  */
export interface BroadcastQueueState {
  instanceId: string;
  timestamp: string;
  pendingTaskCount: number;
  avgLatencyMs?: number;
  activeOrchestrations: number;
  stealableEntries: StealableQueueEntry[];
}

const QUEUE_STATE_DIR = join(COORDINATOR_DIR, "queue-states");

/**
 * Ensure queue state directory exists.
 */
function ensureQueueStateDir(): void {
  if (!existsSync(QUEUE_STATE_DIR)) {
    mkdirSync(QUEUE_STATE_DIR, { recursive: true });
  }
}

 /**
  * キューステータスを他のインスタンスにブロードキャスト
  * @param options - ステータス情報
  * @param options.pendingTaskCount - 保留タスク数
  * @param options.activeOrchestrations - アクティブなオーケストレーション数
  * @param options.stealableEntries - スチール可能なエントリ（省略可）
  * @param options.avgLatencyMs - 平均タスク待機時間（省略可）
  * @returns 戻り値なし
  */
export function broadcastQueueState(options: {
  pendingTaskCount: number;
  activeOrchestrations: number;
  stealableEntries?: StealableQueueEntry[];
  avgLatencyMs?: number;
}): void {
  if (!state) return;

  ensureQueueStateDir();

  const queueState: BroadcastQueueState = {
    instanceId: state.myInstanceId,
    timestamp: new Date().toISOString(),
    pendingTaskCount: options.pendingTaskCount,
    activeOrchestrations: options.activeOrchestrations,
    stealableEntries: options.stealableEntries ?? [],
    avgLatencyMs: options.avgLatencyMs,
  };

  const stateFile = join(QUEUE_STATE_DIR, `${state.myInstanceId}.json`);
  try {
    writeFileSync(stateFile, JSON.stringify(queueState, null, 2));
  } catch {
    // Ignore write errors
  }
}

 /**
  * 全アクティブインスタンスのキューステートを取得
  * @returns キューステートの配列
  */
export function getRemoteQueueStates(): BroadcastQueueState[] {
  if (!state) return [];

  ensureQueueStateDir();
  const nowMs = Date.now();
  const files = readdirSync(QUEUE_STATE_DIR).filter((f) => f.endsWith(".json"));
  const states: BroadcastQueueState[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(QUEUE_STATE_DIR, file), "utf-8");
      const parsed = JSON.parse(content) as BroadcastQueueState;

      // Skip if too old (more than 2x heartbeat interval)
      const timestamp = new Date(parsed.timestamp).getTime();
      if (nowMs - timestamp > DEFAULT_CONFIG.heartbeatIntervalMs * 2) {
        continue;
      }

      // Skip self
      if (parsed.instanceId === state.myInstanceId) {
        continue;
      }

      states.push(parsed);
    } catch {
      // Ignore parse errors
    }
  }

  return states;
}

 /**
  * リモートインスタンスの余裕を確認
  * @returns 余裕がある場合はtrue
  */
export function checkRemoteCapacity(): boolean {
  const remoteStates = getRemoteQueueStates();

  if (remoteStates.length === 0) {
    // No remote instances, we have all capacity
    return true;
  }

  // Check if any remote instance is idle (no pending tasks and low active)
  for (const remoteState of remoteStates) {
    const isIdle =
      remoteState.pendingTaskCount === 0 &&
      remoteState.activeOrchestrations < 2;

    if (isIdle) {
      return true;
    }
  }

  return false;
}

 /**
  * 他のインスタンスからタスクを奪う
  * @returns 奪い取れるキューのエントリ、またはnull
  */
export function stealWork(): StealableQueueEntry | null {
  const remoteStates = getRemoteQueueStates();

  if (remoteStates.length === 0) {
    return null;
  }

  // Find instances with excess work (pending > 2 and not overloaded)
  const candidates: Array<{ state: BroadcastQueueState; entry: StealableQueueEntry }> = [];

  for (const remoteState of remoteStates) {
    if (remoteState.pendingTaskCount <= 2) {
      continue;
    }

    if (remoteState.stealableEntries.length === 0) {
      continue;
    }

    // Take the highest priority entry (first in sorted list)
    const entry = remoteState.stealableEntries[0];
    candidates.push({ state: remoteState, entry });
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort by priority and pick the best
  const priorityOrder = ["critical", "high", "normal", "low", "background"];
  candidates.sort((a, b) => {
    const priorityA = priorityOrder.indexOf(a.entry.priority);
    const priorityB = priorityOrder.indexOf(b.entry.priority);
    return priorityA - priorityB; // Lower index = higher priority
  });

  return candidates[0].entry;
}

 /**
  * ワークスチーリングの概要を取得
  * @returns ワークスチーリングの概要情報（リモートインスタンス数、保留タスク数、盗取可能タスク数、アイドルインスタンス数、ビジーインスタンス数）
  */
export function getWorkStealingSummary(): {
  remoteInstances: number;
  totalPendingTasks: number;
  stealableTasks: number;
  idleInstances: number;
  busyInstances: number;
} {
  const remoteStates = getRemoteQueueStates();

  let totalPending = 0;
  let stealable = 0;
  let idle = 0;
  let busy = 0;

  for (const remoteState of remoteStates) {
    totalPending += remoteState.pendingTaskCount;
    stealable += remoteState.stealableEntries.length;

    if (remoteState.pendingTaskCount === 0 && remoteState.activeOrchestrations < 2) {
      idle++;
    } else if (remoteState.pendingTaskCount > 2) {
      busy++;
    }
  }

  return {
    remoteInstances: remoteStates.length,
    totalPendingTasks: totalPending,
    stealableTasks: stealable,
    idleInstances: idle,
    busyInstances: busy,
  };
}

 /**
  * 古いキューステートファイルをクリーンアップする。
  * @returns 戻り値なし
  */
export function cleanupQueueStates(): void {
  if (!state) return;

  ensureQueueStateDir();
  const nowMs = Date.now();
  const maxAge = DEFAULT_CONFIG.heartbeatTimeoutMs;
  const files = readdirSync(QUEUE_STATE_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const content = readFileSync(join(QUEUE_STATE_DIR, file), "utf-8");
      const parsed = JSON.parse(content) as BroadcastQueueState;
      const timestamp = new Date(parsed.timestamp).getTime();

      if (nowMs - timestamp > maxAge) {
        unlinkSync(join(QUEUE_STATE_DIR, file));
      }
    } catch {
      // Remove corrupted files
      try {
        unlinkSync(join(QUEUE_STATE_DIR, file));
      } catch {
        // Ignore
      }
    }
  }
}

// ============================================================================
// Enhanced Work Stealing with Distributed Lock
// ============================================================================

/**
 * Distributed lock for safe work stealing.
 */
interface DistributedLock {
  lockId: string;
  acquiredAt: number;
  expiresAt: number;
  resource: string;
}

const LOCK_DIR = join(COORDINATOR_DIR, "locks");
const LOCK_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Ensure lock directory exists.
 */
function ensureLockDir(): void {
  if (!existsSync(LOCK_DIR)) {
    mkdirSync(LOCK_DIR, { recursive: true });
  }
}

/**
 * Try to acquire a distributed lock.
 *
 * @param resource - Resource to lock (e.g., "steal:instance-id")
 * @param ttlMs - Lock TTL in milliseconds
 * @returns Lock object if acquired, null otherwise
 */
function tryAcquireLock(resource: string, ttlMs: number = LOCK_TIMEOUT_MS): DistributedLock | null {
  if (!state) return null;

  ensureLockDir();

  const lockId = `${state.myInstanceId}-${Date.now().toString(36)}`;
  const lockFile = join(LOCK_DIR, `${resource.replace(/[:/]/g, "_")}.lock`);
  const nowMs = Date.now();

  // Check existing lock
  if (existsSync(lockFile)) {
    try {
      const content = readFileSync(lockFile, "utf-8");
      const existing = JSON.parse(content) as DistributedLock;

      // Check if lock is expired
      if (nowMs < existing.expiresAt) {
        return null; // Lock is still valid
      }
    } catch {
      // Corrupted lock, proceed to acquire
    }
  }

  // Acquire lock
  const lock: DistributedLock = {
    lockId,
    acquiredAt: nowMs,
    expiresAt: nowMs + ttlMs,
    resource,
  };

  try {
    writeFileSync(lockFile, JSON.stringify(lock, null, 2));
    return lock;
  } catch {
    return null;
  }
}

/**
 * Release a distributed lock.
 *
 * @param lock - Lock to release
 */
function releaseLock(lock: DistributedLock): void {
  const lockFile = join(LOCK_DIR, `${lock.resource.replace(/[:/]/g, "_")}.lock`);

  try {
    const content = readFileSync(lockFile, "utf-8");
    const existing = JSON.parse(content) as DistributedLock;

    // Only release if we own the lock
    if (existing.lockId === lock.lockId) {
      unlinkSync(lockFile);
    }
  } catch {
    // Ignore errors
  }
}

 /**
  * スチール統計情報（公開インターフェース）
  * @param totalAttempts 総試行回数
  * @param successfulSteals スチール成功回数
  * @param failedAttempts スチール失敗回数
  * @param successRate 成功率
  * @param avgLatencyMs 平均レイテンシ（ミリ秒）
  * @param lastStealAt 最終スチール日時
  */
export interface StealingStats {
  totalAttempts: number;
  successfulSteals: number;
  failedAttempts: number;
  successRate: number;
  avgLatencyMs: number;
  lastStealAt: number | null;
}

/**
 * Stealing statistics tracking (internal).
 */
interface StealingStatsInternal {
  totalAttempts: number;
  successfulSteals: number;
  failedAttempts: number;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  avgLatencyMs: number;
  latencySamples: number[];
}

let stealingStats: StealingStatsInternal = {
  totalAttempts: 0,
  successfulSteals: 0,
  failedAttempts: 0,
  lastAttemptAt: null,
  lastSuccessAt: null,
  avgLatencyMs: 0,
  latencySamples: [],
};

 /**
  * インスタンスがアイドル状態か確認する
  * @returns アイドル状態の場合はtrue
  */
export function isIdle(): boolean {
  if (!state) return true;

  const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);

  try {
    const content = readFileSync(lockFile, "utf-8");
    const info = JSON.parse(content) as InstanceInfo;

    // Idle if no pending tasks and no active models
    return (info.pendingTaskCount ?? 0) === 0 && info.activeModels.length === 0;
  } catch {
    return true;
  }
}

 /**
  * 仕事を奪う最適なインスタンスを探す
  * @returns 最も仕事があるインスタンス情報、候補がいなければnull
  */
export function findStealCandidate(): InstanceInfo | null {
  if (!state) return null;

  const instances = getActiveInstances();

  // Filter to instances with excess work
  const candidates = instances.filter((inst) => {
    // Skip self
    if (inst.instanceId === state!.myInstanceId) return false;

    // Must have pending tasks
    if ((inst.pendingTaskCount ?? 0) <= 2) return false;

    // Must be alive
    const nowMs = Date.now();
    const lastHeartbeat = new Date(inst.lastHeartbeat).getTime();
    if (nowMs - lastHeartbeat > DEFAULT_CONFIG.heartbeatTimeoutMs) return false;

    return true;
  });

  if (candidates.length === 0) return null;

  // Sort by pending task count (descending)
  candidates.sort((a, b) => (b.pendingTaskCount ?? 0) - (a.pendingTaskCount ?? 0));

  return candidates[0];
}

 /**
  * 他インスタンスからワークを安全にスチール
  * @returns スチールしたキューのエントリ、またはnull
  */
export async function safeStealWork(): Promise<StealableQueueEntry | null> {
  if (!state) return null;

  // Check if work stealing is enabled
  if (process.env.PI_ENABLE_WORK_STEALING === "false") {
    return null;
  }

  // Find candidate
  const candidate = findStealCandidate();
  if (!candidate) return null;

  // Acquire lock for stealing from this instance
  const lockResource = `steal:${candidate.instanceId}`;
  const lock = tryAcquireLock(lockResource);

  if (!lock) {
    // Another instance is already stealing from this candidate
    stealingStats.totalAttempts++;
    stealingStats.failedAttempts++;
    stealingStats.lastAttemptAt = Date.now();
    return null;
  }

  const startTime = Date.now();

  try {
    stealingStats.totalAttempts++;
    stealingStats.lastAttemptAt = startTime;

    // Get the stealable entry
    const entry = stealWork();

    if (entry) {
      stealingStats.successfulSteals++;
      stealingStats.lastSuccessAt = Date.now();

      const latency = Date.now() - startTime;
      stealingStats.latencySamples.push(latency);
      if (stealingStats.latencySamples.length > 100) {
        stealingStats.latencySamples.shift();
      }
      stealingStats.avgLatencyMs = stealingStats.latencySamples.reduce((a, b) => a + b, 0) /
        stealingStats.latencySamples.length;
    } else {
      stealingStats.failedAttempts++;
    }

    return entry;
  } finally {
    releaseLock(lock);
  }
}

 /**
  * ワークスティーリングの統計情報を取得する。
  * @returns スティーリング統計情報
  */
export function getStealingStats(): StealingStats {
  return {
    totalAttempts: stealingStats.totalAttempts,
    successfulSteals: stealingStats.successfulSteals,
    failedAttempts: stealingStats.failedAttempts,
    successRate: stealingStats.totalAttempts > 0
      ? stealingStats.successfulSteals / stealingStats.totalAttempts
      : 0,
    avgLatencyMs: stealingStats.avgLatencyMs,
    lastStealAt: stealingStats.lastSuccessAt,
  };
}

 /**
  * 盗み統計をリセットする。
  * @returns 戻り値なし
  */
export function resetStealingStats(): void {
  stealingStats = {
    totalAttempts: 0,
    successfulSteals: 0,
    failedAttempts: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    avgLatencyMs: 0,
    latencySamples: [],
  };
}

 /**
  * 期限切れのロックを削除する。
  * @returns 戻り値なし
  */
export function cleanupExpiredLocks(): void {
  ensureLockDir();

  const nowMs = Date.now();
  const files = readdirSync(LOCK_DIR).filter((f) => f.endsWith(".lock"));

  for (const file of files) {
    try {
      const content = readFileSync(join(LOCK_DIR, file), "utf-8");
      const lock = JSON.parse(content) as DistributedLock;

      if (nowMs >= lock.expiresAt) {
        unlinkSync(join(LOCK_DIR, file));
      }
    } catch {
      // Remove corrupted lock files
      try {
        unlinkSync(join(LOCK_DIR, file));
      } catch {
        // Ignore
      }
    }
  }
}

 /**
  * 強化されたハートビート処理
  * @returns {void}
  */
export function enhancedHeartbeat(): void {
  updateHeartbeat();
  cleanupDeadInstances();
  cleanupQueueStates();
  cleanupExpiredLocks();
}
