/**
 * @abdd.meta
 * path: .pi/lib/cross-instance-coordinator.ts
 * role: 複数のpiインスタンス間でLLM並列数制限を調整するコーディネータ
 * why: プロセス間でリソース競合を防ぎ、全体の並列数を適切に管理するため
 * related: .pi/lib/runtime-config.ts, .pi/lib/adaptive-total-limit.ts
 * public_api: ActiveModelInfo, InstanceInfo, CoordinatorConfig, CoordinatorInternalState, resetHeartbeatDebounce
 * invariants: totalMaxLlmはgetRuntimeConfigおよびadaptiveTotal-limitの計算結果に依存する
 * side_effects: ~/.pi/runtime/ディレクトリへのファイル作成、更新、削除を行う
 * failure_modes: ディレクトリ権限がない場合、またはファイルロック取得に失敗した場合に動作しない
 * @abdd.explain
 * overview: ファイルベースのロックとハートビートを使用し、複数インスタンスの生存状態と負荷状況を管理する
 * what_it_does:
 *   - 設定値をruntime-config.tsから集約し、デフォルト設定を生成する
 *   - ランタイムディレクトリのパスを解決する
 * why_it_exists:
 *   - インスタンス間の設定の一貫性を保つため
 *   - 実行環境（stable/default）に応じて柔軟に振る舞うため
 * scope:
 *   in: 環境変数PI_RUNTIME_DIR, RuntimeConfig, getAdaptiveTotalLlm
 * out: CoordinatorConfig, ランタイムディレクトリパス
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

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, openSync, closeSync, renameSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pid } from "node:process";
import { randomBytes } from "node:crypto";
import {
  getRuntimeConfig,
  type RuntimeConfig,
} from "./runtime-config.js";
import { getAdaptiveTotalMaxLlm } from "./adaptive-total-limit.js";

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

/**
 * Legacy constant for backward compatibility.
 * @deprecated Use getRuntimeConfig() instead.
 */
const DEFAULT_CONFIG: CoordinatorConfig = {
  totalMaxLlm: 12,  // Will be overridden by runtime-config
  heartbeatIntervalMs: 15_000,
  heartbeatTimeoutMs: 60_000,
};

function resolveCoordinatorRuntimeDir(): string {
  const raw = String(process.env.PI_RUNTIME_DIR || "").trim();
  if (!raw) return join(homedir(), ".pi", "runtime");
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
  return raw;
}

const COORDINATOR_DIR = resolveCoordinatorRuntimeDir();
const INSTANCES_DIR = join(COORDINATOR_DIR, "instances");
const CONFIG_FILE = join(COORDINATOR_DIR, "coordinator.json");

// ============================================================================
// State
// ============================================================================

let state: CoordinatorInternalState | null = null;
let coordinatorNowProvider: () => number = () => Date.now();

// Heartbeat debounce
let lastHeartbeatWrite = 0;
let memoryHeartbeat = Date.now();

/**
 * @summary ハートビートdebounce状態をリセット（テスト用）
 */
export function resetHeartbeatDebounce(): void {
  lastHeartbeatWrite = 0;
  memoryHeartbeat = Date.now();
}

function currentTimeMs(): number {
  return coordinatorNowProvider();
}

/**
 * 現在時刻取得関数を設定
 * @summary 現在時刻関数を設定
 * @param {(() => number) | undefined} provider - 現在時刻を返す関数（未指定でリセット）
 * @returns {void}
 */
export function setCoordinatorNowProvider(provider?: () => number): void {
  coordinatorNowProvider = provider ?? (() => Date.now());
}

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

function logCoordinatorDebug(message: string, error?: unknown): void {
  if (process.env.PI_DEBUG_COORDINATOR !== "1") return;
  if (error instanceof Error) {
    console.error(`[cross-instance-coordinator] ${message}: ${error.message}`);
    return;
  }
  if (error !== undefined) {
    console.error(`[cross-instance-coordinator] ${message}: ${String(error)}`);
    return;
  }
  console.error(`[cross-instance-coordinator] ${message}`);
}

function writeTextFileAtomic(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp-${pid}-${currentTimeMs().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmpPath, content, "utf-8");
  try {
    renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.debug(`[cross-instance-coordinator] Failed to cleanup temp file ${tmpPath}: ${errorMessage}`);
    }
    throw error;
  }
}

function writeJsonFileAtomic(filePath: string, payload: unknown): void {
  writeTextFileAtomic(filePath, JSON.stringify(payload, null, 2));
}

function getMyLockFilePath(): string | null {
  if (!state) return null;
  return join(INSTANCES_DIR, `${state.myInstanceId}.lock`);
}

function createDefaultMyInstanceInfo(): InstanceInfo | null {
  if (!state) return null;
  const nowIso = new Date().toISOString();
  return {
    instanceId: state.myInstanceId,
    pid,
    sessionId: state.mySessionId,
    startedAt: state.myStartedAt,
    lastHeartbeat: nowIso,
    cwd: process.cwd(),
    activeModels: [],
  };
}

/**
 * Patch my lock-file state in one place to reduce accidental field loss.
 */
function patchMyInstanceInfo(mutator: (info: InstanceInfo) => void): void {
  if (!state) return;
  ensureDirs();
  const lockFile = getMyLockFilePath();
  const fallback = createDefaultMyInstanceInfo();
  if (!lockFile || !fallback) return;

  let info: InstanceInfo = { ...fallback };

  if (existsSync(lockFile)) {
    try {
      const content = readFileSync(lockFile, "utf-8");
      const parsed = JSON.parse(content) as InstanceInfo;
      info = { ...fallback, ...parsed };
      info.activeModels = Array.isArray(parsed.activeModels) ? parsed.activeModels : [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.debug(`[cross-instance-coordinator] Failed to parse lock file ${lockFile}: ${errorMessage}`);
    }
  }

  try {
    mutator(info);
    info.instanceId = state.myInstanceId;
    info.pid = pid;
    info.sessionId = state.mySessionId;
    info.startedAt = info.startedAt || state.myStartedAt;
    info.cwd = info.cwd || process.cwd();
    if (!Array.isArray(info.activeModels)) {
      info.activeModels = [];
    }
    writeJsonFileAtomic(lockFile, info);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logCoordinatorDebug(`patchMyInstanceInfo write failed: ${errorMessage}`);
  }
}

function generateInstanceId(sessionId: string): string {
  const timestamp = currentTimeMs().toString(36);
  const randomSuffix = randomBytes(4).toString("hex");
  return `sess-${sessionId.slice(0, 8)}-pid${pid}-${timestamp}-${randomSuffix}`;
}

function parseLockFile(filename: string): InstanceInfo | null {
  try {
    const content = readFileSync(join(INSTANCES_DIR, filename), "utf-8");
    const parsed = JSON.parse(content) as InstanceInfo;
    return parsed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.debug(`[cross-instance-coordinator] Failed to parse lock file ${filename}: ${errorMessage}`);
    return null;
  }
}

function isProcessAlive(processId: number): boolean {
  if (!Number.isFinite(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EPERM") return true;
    return false;
  }
}

function shouldCheckProcessLiveness(info: InstanceInfo): boolean {
  const instanceId = String(info.instanceId || "");
  return instanceId.includes("-pid");
}

function isInstanceAlive(info: InstanceInfo, nowMs: number, timeoutMs: number): boolean {
  if (shouldCheckProcessLiveness(info) && !isProcessAlive(info.pid)) {
    return false;
  }
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logCoordinatorDebug(`loadConfig failed, using defaults: ${errorMessage}`);
  }
  return defaults;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * インスタンスを登録してハートビートを開始する
 * @summary インスタンス登録
 * @param sessionId - セッションID
 * @param cwd - カレントワーキングディレクトリ
 * @param configOverrides - コンフィグの上書き設定（任意）
 * @returns {void}
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

  // Track timer for cleanup on error (BUG-018)
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  try {
    writeJsonFileAtomic(lockFile, info);

    // Start heartbeat
    heartbeatTimer = setInterval(() => {
      updateHeartbeat();
      cleanupDeadInstances();
    }, config.heartbeatIntervalMs);

    // 初回は書き込み時にdebounceをバイパ防止
    // 初回は書き込み
    lastHeartbeatWrite = now;

    // Don't prevent process exit
    heartbeatTimer.unref();

    state = {
      myInstanceId: instanceId,
      mySessionId: sessionId,
      myStartedAt: now,
      config,
      heartbeatTimer,
    };
  } catch (error) {
    // Clean up timer on error to prevent leak (BUG-018)
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    throw error;
  }
}

/**
 * 自身のインスタンス登録を解除
 * @summary インスタンス登録解除
 * @returns {void}
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.debug(`[cross-instance-coordinator] Failed to remove lock file during unregister: ${errorMessage}`);
  }

  state = null;
}

/**
 * ハートビート時刻を更新
 * @summary ハートビート更新
 * @returns {void}
 */
export function updateHeartbeat(): void {
  if (!state) return;

  // Debounce: 前回の書き込みからHEARTBEAT_DEBOUNCE_MS経過していない場合は
  // メモリ上の状態のみ更新
  const now = Date.now();
  const HEARTBEAT_DEBOUNCE_MS = 5000; // 5秒

  // メモリ上のハートビート時刻を更新
  memoryHeartbeat = now;

  // 初回（lastHeartbeatWrite === 0）またはdebounce期間経過後の場合は書き込み
  if (lastHeartbeatWrite > 0 && now - lastHeartbeatWrite < HEARTBEAT_DEBOUNCE_MS) {
    return;
  }

  // ファイルに書き込み
  patchMyInstanceInfo((info) => {
    info.lastHeartbeat = new Date().toISOString();
  });
  lastHeartbeatWrite = now;
}

/**
 * 無効なインスタンス情報を削除
 * @summary 無効インスタンス削除
 * @returns {void}
 */
export function cleanupDeadInstances(): void {
  if (!state) return;

  ensureDirs();
  const nowMs = currentTimeMs();
  const files = readdirSync(INSTANCES_DIR).filter((f) => f.endsWith(".lock"));

  for (const file of files) {
    const info = parseLockFile(file);
    if (!info) {
      // Corrupted lock file, remove it
      try {
        unlinkSync(join(INSTANCES_DIR, file));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logCoordinatorDebug(`cleanupDeadInstances failed to remove corrupted lock file ${file}: ${errorMessage}`);
      }
      continue;
    }

    // Skip self
    if (info.instanceId === state.myInstanceId) continue;

    // Remove dead instances
    if (!isInstanceAlive(info, nowMs, state.config.heartbeatTimeoutMs)) {
      try {
        unlinkSync(join(INSTANCES_DIR, file));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logCoordinatorDebug(`cleanupDeadInstances failed to remove stale lock file ${file}: ${errorMessage}`);
      }
    }
  }
}

/**
 * アクティブなインスタンス数を取得
 * @summary アクティブ数取得
 * @returns {number} アクティブなインスタンス数
 */
export function getActiveInstanceCount(): number {
  if (!state) {
    // Not registered yet, assume single instance
    return 1;
  }

  ensureDirs();
  const nowMs = currentTimeMs();
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
 * アクティブなインスタンス情報一覧を取得
 * @summary インスタンス情報一覧取得
 * @returns {InstanceInfo[]} アクティブなインスタンス情報の配列
 */
export function getActiveInstances(): InstanceInfo[] {
  if (!state) {
    return [];
  }

  ensureDirs();
  const nowMs = currentTimeMs();
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
 * 自身の並列実行数の上限を取得する
 * @summary 自身の並列数取得
 * @returns 並列実行数の上限
 */
export function getMyParallelLimit(): number {
  if (!state) {
    return 1;
  }

  const contendingCount = getContendingInstanceCount();
  const baseLimit = Math.max(1, Math.floor(state.config.totalMaxLlm / contendingCount));

  return baseLimit;
}

function isContendingInstance(info: InstanceInfo): boolean {
  const activeModels = Array.isArray(info.activeModels) ? info.activeModels.length : 0;
  const activeRequests = Math.max(0, Math.trunc(info.activeRequestCount || 0));
  const activeLlm = Math.max(0, Math.trunc(info.activeLlmCount || 0));
  const pendingTasks = Math.max(0, Math.trunc(info.pendingTaskCount || 0));
  return activeModels > 0 || activeRequests > 0 || activeLlm > 0 || pendingTasks > 0;
}

/**
 * 実際に負荷を持つインスタンス数を取得
 * @summary 競合インスタンス数取得
 * @returns {number} 競合中インスタンス数（最低1）
 */
export function getContendingInstanceCount(): number {
  if (!state) {
    return 1;
  }

  const instances = getActiveInstances();
  const contending = instances.filter((inst) => isContendingInstance(inst));
  const includesSelf = contending.some((inst) => inst.instanceId === state!.myInstanceId);
  if (!includesSelf) {
    return Math.max(1, contending.length + 1);
  }
  return Math.max(1, contending.length);
}

/**
 * 動的並列数の上限を計算する
 * @summary 動的並列数計算
 * @param myPendingTasks 自分の保留中タスク数
 * @returns 並列数の上限
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
 * ワークスチーリングを試行すべきか判定する
 * @summary スチーリング判定
 * @returns 試行する場合はtrue
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
 * ワークスチーリングの候補を取得する
 * @summary 候補インスタンス取得
 * @param topN 取得する最大数
 * @returns 候補インスタンスIDの配列
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
 * @summary ワークロード情報更新
 * @param pendingTaskCount 保留中のタスク数
 * @param avgLatencyMs 平均レイテンシ(ms)
 * @returns void
 */
export function updateWorkloadInfo(pendingTaskCount: number, avgLatencyMs?: number): void {
  if (!state) {
    return;
  }

  const nowIso = new Date().toISOString();
  patchMyInstanceInfo((info) => {
    info.lastHeartbeat = nowIso;
    info.pendingTaskCount = Math.max(0, Math.trunc(pendingTaskCount || 0));
    if (avgLatencyMs !== undefined) {
      info.avgLatencyMs = Math.max(0, Math.trunc(avgLatencyMs || 0));
      info.lastTaskCompletedAt = nowIso;
    }
  });
}

/**
 * ランタイム使用量を更新する
 * @summary ランタイム使用量更新
 * @param activeRequestCount 実行中リクエスト数
 * @param activeLlmCount 実行中LLM数
 */
export function updateRuntimeUsage(activeRequestCount: number, activeLlmCount: number): void {
  if (!state) return;

  patchMyInstanceInfo((info) => {
    info.lastHeartbeat = new Date().toISOString();
    info.activeRequestCount = Math.max(0, Math.trunc(activeRequestCount || 0));
    info.activeLlmCount = Math.max(0, Math.trunc(activeLlmCount || 0));
  });
}

/**
 * クラスタ全体のランタイム使用量を取得する
 * @summary クラスタ使用量取得
 */
export function getClusterRuntimeUsage(): {
  totalActiveRequests: number;
  totalActiveLlm: number;
  instanceCount: number;
} {
  if (!state) {
    return {
      totalActiveRequests: 0,
      totalActiveLlm: 0,
      instanceCount: 0,
    };
  }

  const instances = getActiveInstances();
  let totalActiveRequests = 0;
  let totalActiveLlm = 0;

  for (const instance of instances) {
    totalActiveRequests += Math.max(0, Math.trunc(instance.activeRequestCount || 0));
    totalActiveLlm += Math.max(0, Math.trunc(instance.activeLlmCount || 0));
  }

  return {
    totalActiveRequests,
    totalActiveLlm,
    instanceCount: instances.length,
  };
}

/**
 * コーディネーター詳細を取得
 * @summary コーディネーター詳細を取得
 * @returns 登録状態、インスタンスID、アクティブ数、並列制限、設定、インスタンス一覧を含むステータス情報
 */
export function getCoordinatorStatus(): {
  registered: boolean;
  myInstanceId: string | null;
  activeInstanceCount: number;
  contendingInstanceCount: number;
  myParallelLimit: number;
  config: CoordinatorConfig | null;
  instances: InstanceInfo[];
} {
  if (!state) {
    return {
      registered: false,
      myInstanceId: null,
      activeInstanceCount: 1,
      contendingInstanceCount: 1,
      myParallelLimit: getRuntimeConfig().totalMaxLlm,
      config: null,
      instances: [],
    };
  }

  const activeCount = getActiveInstanceCount();
  const contendingCount = getContendingInstanceCount();
  const myLimit = getMyParallelLimit();

  return {
    registered: true,
    myInstanceId: state.myInstanceId,
    activeInstanceCount: activeCount,
    contendingInstanceCount: contendingCount,
    myParallelLimit: myLimit,
    config: state.config,
    instances: getActiveInstances(),
  };
}

/**
 * コーディネータ初期化確認
 * @summary 初期化済みか確認
 * @returns 初期化済みの場合はtrue
 */
export function isCoordinatorInitialized(): boolean {
  return state !== null;
}

/**
 * @summary 合計最大LLM数を取得
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
 * @summary 設定上書きを取得
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
 * アクティブモデルを設定
 * @summary モデルを設定
 * @param provider プロバイダ名
 * @param model モデル名
 * @returns なし
 */
export function setActiveModel(provider: string, model: string): void {
  if (!state) return;

  patchMyInstanceInfo((info) => {
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
  });
}

/**
 * 指定モデル情報をクリア
 * @summary モデルクリア
 * @param provider プロバイダ名
 * @param model モデル名
 * @returns なし
 */
export function clearActiveModel(provider: string, model: string): void {
  if (!state) return;

  patchMyInstanceInfo((info) => {
    const normalizedProvider = provider.toLowerCase();
    const normalizedModel = model.toLowerCase();

    info.activeModels = info.activeModels.filter(
      (m) => !(m.provider === normalizedProvider && m.model === normalizedModel)
    );

    info.lastHeartbeat = new Date().toISOString();
  });
}

/**
 * 全てのモデル情報をクリア
 * @summary 全モデルクリア
 * @returns なし
 */
export function clearAllActiveModels(): void {
  if (!state) return;

  patchMyInstanceInfo((info) => {
    info.activeModels = [];
    info.lastHeartbeat = new Date().toISOString();
  });
}

/**
 * アクティブインスタンス数を取得
 * @summary アクティブ数取得
 * @param provider プロバイダ名
 * @param model モデル名
 * @returns アクティブなインスタンス数
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
 * 並列数上限を取得
 * @summary 並列上限取得
 * @param provider プロバイダ名
 * @param model モデル名
 * @param baseLimit 基本上限値
 * @returns 並列数の上限
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
 * 使用状況を取得
 * @summary 使用状況取得
 * @returns モデルごとの利用数とインスタンス情報
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
 * 横取り可能なキューエントリ
 * @summary 横取りエントリ定義
 * @property {string} id - エントリID
 * @property {string} toolName - ツール名
 * @property {number} priority - 優先度
 * @property {string} instanceId - インスタンスID
 * @property {string} enqueuedAt - エンキュー日時
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
 * ブロードキャスト用キューステート
 * @summary キューステート定義
 * @property {string} instanceId - インスタンスID
 * @property {string} timestamp - タイムスタンプ
 * @property {number} pendingTaskCount - 保留タスク数
 * @property {number} avgLatencyMs - 平均レイテンシ
 * @property {number} activeOrchestrations - アクティブなオーケストレーション数
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
 * @summary ステータス送信
 * @param {object} options - ステータス情報
 * @param {number} options.pendingTaskCount - 保留タスク数
 * @param {number} options.activeOrchestrations - アクティブなオーケストレーション数
 * @param {StealableQueueEntry[]} [options.stealableEntries] - 横取り可能なキューエントリ
 * @param {number} [options.avgLatencyMs] - 平均レイテンシ(ミリ秒)
 * @returns {void}
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
    writeJsonFileAtomic(stateFile, queueState);
  } catch {
    // Ignore write errors
  }
}

/**
 * リモートキューステータスを取得
 * @summary ステータス取得
 * @returns {BroadcastQueueState[]} リモートインスタンスのキューステート一覧
 */
export function getRemoteQueueStates(): BroadcastQueueState[] {
  if (!state) return [];

  ensureQueueStateDir();
  const nowMs = currentTimeMs();
  const maxAgeMs = Math.max(1, state.config.heartbeatIntervalMs * 2);
  const files = readdirSync(QUEUE_STATE_DIR).filter((f) => f.endsWith(".json"));
  const states: BroadcastQueueState[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(QUEUE_STATE_DIR, file), "utf-8");
      const parsed = JSON.parse(content) as BroadcastQueueState;

      // Skip if too old (more than 2x heartbeat interval)
      const timestamp = new Date(parsed.timestamp).getTime();
      if (nowMs - timestamp > maxAgeMs) {
        continue;
      }

      // Skip self
      if (parsed.instanceId === state.myInstanceId) {
        continue;
      }

      states.push(parsed);
    } catch {
      logCoordinatorDebug(`getRemoteQueueStates failed to parse ${file}`);
      // Ignore parse errors
    }
  }

  return states;
}

/**
 * リモート容量を確認
 * @summary 容量確認
 * @returns {boolean} リモートの処理容量があるかどうか
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
 * タスクをスチール実行
 * @summary タスク取得
 * @returns {StealableQueueEntry | null} スチール対象エントリ、対象なしの場合null
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
 * ワークスチーリング概要取得
 * @summary 概要取得
 * @returns {object} スチーリング概要
 * @returns {number} remoteInstances - リモートインスタンス数
 * @returns {number} totalPendingTasks - 総保留タスク数
 * @returns {number} stealableTasks - スチール可能タスク数
 * @returns {number} idleInstances - アイドルインスタンス数
 * @returns {number} busyInstances - ビジーインスタンス数
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
 * キュー状態を初期化
 * @summary 状態初期化
 * @returns {void}
 */
export function cleanupQueueStates(): void {
  if (!state) return;

  ensureQueueStateDir();
  const nowMs = currentTimeMs();
  const maxAge = Math.max(1, state.config.heartbeatTimeoutMs);
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
      logCoordinatorDebug(`cleanupQueueStates failed to parse ${file}, removing`);
      // Remove corrupted files
      try {
        unlinkSync(join(QUEUE_STATE_DIR, file));
      } catch {
        logCoordinatorDebug(`cleanupQueueStates failed to remove ${file}`);
        // Ignore
      }
    }
  }
}

// ============================================================================
// Enhanced Work Stealing with Distributed Lock
// ============================================================================

/**
 * 分散ロックの情報を表すインターフェース
 * @summary 分散ロック定義
 */
export interface DistributedLock {
  lockId: string;
  acquiredAt: number;
  expiresAt: number;
  resource: string;
}

let lockDirOverride: string | null = null;

/**
 * ロックディレクトリを設定（テスト用）
 * @summary ロックディレクトリ設定
 * @param dir - ロックディレクトリのパス（nullでリセット）
 * @returns {void}
 */
export function setLockDirForTesting(dir: string | null): void {
  lockDirOverride = dir;
}

function getLockDir(): string {
  return lockDirOverride ?? join(COORDINATOR_DIR, "locks");
}

const LOCK_DIR_LEGACY = join(COORDINATOR_DIR, "locks");
const LOCK_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Ensure lock directory exists.
 */
function ensureLockDir(): void {
  const lockDir = getLockDir();
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }
}

/**
 * Try to acquire a distributed lock with retry logic.
 * Uses atomic O_EXCL (wx flag) to prevent TOCTOU race conditions.
 *
 * @param resource - Resource to lock (e.g., "steal:instance-id")
 * @param ttlMs - Lock TTL in milliseconds
 * @param maxRetries - Maximum retry attempts on collision (default: 3)
 * @returns Lock object if acquired, null otherwise
 */
export function tryAcquireLock(
  resource: string,
  ttlMs: number = LOCK_TIMEOUT_MS,
  maxRetries: number = 3,
): DistributedLock | null {
  if (!state) return null;

  ensureLockDir();

  const lockDir = getLockDir();
  const lockId = `${state.myInstanceId}-${currentTimeMs().toString(36)}`;
  const lockFile = join(lockDir, `${resource.replace(/[:/]/g, "_")}.lock`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const nowMs = currentTimeMs();
    const lock: DistributedLock = {
      lockId,
      acquiredAt: nowMs,
      expiresAt: nowMs + ttlMs,
      resource,
    };

    // ATOMIC ACQUISITION: Try to create lock file with wx flag (O_EXCL)
    // This is the primary path - if file doesn't exist, we acquire atomically
    let fd: number | undefined;
    try {
      fd = openSync(lockFile, "wx");
      const lockContent = JSON.stringify(lock, null, 2);
      writeSync(fd, lockContent);
      return lock;
    } catch (error: unknown) {
      const errorCode = (error as NodeJS.ErrnoException)?.code;

      if (errorCode === "EEXIST") {
        // File exists - check if we can clean up expired lock and retry
        const cleaned = tryCleanupExpiredLock(lockFile, nowMs);
        if (!cleaned) {
          // Lock is still valid or cleanup failed, another instance holds it
          return null;
        }
        // Lock was expired and cleaned up, retry acquisition
        // Add exponential backoff delay to reduce TOCTOU race condition
        if (attempt < maxRetries) {
          const delayMs = Math.min(10 * Math.pow(2, attempt), 100);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
        }
        continue;
      }

      // Other errors (permissions, disk full, etc.) - don't retry
      return null;
    } finally {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  // Exhausted retries
  return null;
}

/**
 * Attempt to clean up an expired lock file atomically.
 * Returns true if lock was expired and cleaned up, false otherwise.
 *
 * @param lockFile - Path to lock file
 * @param nowMs - Current timestamp in milliseconds
 * @returns {boolean} true if lock was cleaned up, false if still valid or error
 */
function tryCleanupExpiredLock(lockFile: string, nowMs: number): boolean {
  try {
    const content = readFileSync(lockFile, "utf-8");
    const existing = JSON.parse(content) as DistributedLock;

    // Check if lock is still valid
    if (nowMs < existing.expiresAt) {
      return false; // Lock is still valid
    }

    // Lock is expired - try to clean it up atomically using rename
    const tempFile = `${lockFile}.cleanup.${nowMs}`;
    try {
      renameSync(lockFile, tempFile);
      unlinkSync(tempFile);
      return true; // Successfully cleaned up
    } catch {
      // Another process may have already cleaned it up or acquired it
      return false;
    }
  } catch {
    // Corrupted lock file - try to clean up atomically
    const tempFile = `${lockFile}.cleanup.${nowMs}`;
    try {
      renameSync(lockFile, tempFile);
      unlinkSync(tempFile);
      return true;
    } catch {
      // Another process may have handled it
      return false;
    }
  }
}

/**
 * Acquire a distributed lock with automatic retry on collision.
 * This is the recommended API for acquiring locks as it handles TOCTOU races.
 *
 * @param resource - Resource to lock (e.g., "steal:instance-id")
 * @param ttlMs - Lock TTL in milliseconds
 * @returns Lock object if acquired, null otherwise
 */
export function acquireDistributedLock(
  resource: string,
  ttlMs: number = LOCK_TIMEOUT_MS,
): DistributedLock | null {
  return tryAcquireLock(resource, ttlMs, 3);
}

/**
 * Release a distributed lock.
 *
 * @param lock - Lock to release
 */
export function releaseLock(lock: DistributedLock): void {
  const lockDir = getLockDir();
  const lockFile = join(lockDir, `${lock.resource.replace(/[:/]/g, "_")}.lock`);

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
 * ステータス統計情報
 * @summary 統計情報取得
 * @returns {object} ステータス統計
 * @returns {number} totalAttempts - 総試行回数
 * @returns {number} successfulSteals - 成功回数
 * @returns {number} failedAttempts - 失敗回数
 * @returns {number} successRate - 成功率
 * @returns {number} avgLatencyMs - 平均遅延時間(ms)
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
 * アイドル状態か確認
 * @summary アイドル確認
 * @returns {boolean} アイドル状態の場合true
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
 * 奪取候補を検索
 * @summary 候補検索
 * @returns {InstanceInfo | null} 奪取候補のインスタンス情報、またはnull
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
    const nowMs = currentTimeMs();
    const lastHeartbeat = new Date(inst.lastHeartbeat).getTime();
    if (nowMs - lastHeartbeat > state!.config.heartbeatTimeoutMs) return false;

    return true;
  });

  if (candidates.length === 0) return null;

  // Sort by pending task count (descending)
  candidates.sort((a, b) => (b.pendingTaskCount ?? 0) - (a.pendingTaskCount ?? 0));

  return candidates[0];
}

/**
 * 安全にタスクを奪取
 * @summary タスク奪取
 * @returns {Promise<StealableQueueEntry | null>} 奪取したタスク、またはnull
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
    stealingStats.lastAttemptAt = currentTimeMs();
    return null;
  }

  const startTime = currentTimeMs();

  try {
    stealingStats.totalAttempts++;
    stealingStats.lastAttemptAt = startTime;

    // Get the stealable entry
    const entry = stealWork();

    if (entry) {
      stealingStats.successfulSteals++;
      stealingStats.lastSuccessAt = currentTimeMs();

      const latency = currentTimeMs() - startTime;
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
 * ステータス統計を取得
 * @summary 統計取得
 * @returns {StealingStats} ステータス統計情報
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
 * ステータス統計をリセット
 * @summary 統計リセット
 * @returns {void}
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
 * 期限切れロックを削除
 * @summary 期限切れロック削除
 * @returns {void}
 */
export function cleanupExpiredLocks(): void {
  ensureLockDir();

  const lockDir = getLockDir();
  const nowMs = currentTimeMs();
  const files = readdirSync(lockDir).filter((f) => f.endsWith(".lock"));

  for (const file of files) {
    try {
      const content = readFileSync(join(lockDir, file), "utf-8");
      const lock = JSON.parse(content) as DistributedLock;

      if (nowMs >= lock.expiresAt) {
        unlinkSync(join(lockDir, file));
      }
    } catch {
      // Remove corrupted lock files
      try {
        unlinkSync(join(lockDir, file));
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * ハートビート処理の強化
 * @summary ハートビート送信
 * @returns {void}
 */
export function enhancedHeartbeat(): void {
  updateHeartbeat();
  cleanupDeadInstances();
  cleanupQueueStates();
  cleanupExpiredLocks();
}
