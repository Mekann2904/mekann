/**
 * @abdd.meta
 * path: .pi/lib/checkpoint-manager.ts
 * role: 長時間実行タスクのチェックポイント保存、復旧、有効期限管理を行う永続化レイヤー
 * why: タスクの中断と再開、優先度に基づくリソース管理、TTLによる古いデータの自動削除を実現するため
 * related: .pi/lib/task-scheduler.ts, .pi/extensions/agent-runtime.ts
 * public_api: Checkpoint, CheckpointSaveResult, PreemptionResult, CheckpointManagerConfig, CheckpointManager
 * invariants: チェックポイントIDは一意である、stateはJSONシリアライズ可能である、createdAtとttlMsにより有効期限が決まる
 * side_effects: ファイルシステムへのデータ書き込み、チェックポイントファイルの作成および削除
 * failure_modes: ディスク容量不足による保存失敗、JSONパースエラー、ファイルシステム権限エラー
 * @abdd.explain
 * overview: TTLおよび優先度管理機能を持つチェックポイントのファイルシステムへの永続化および復元機構
 * what_it_does:
 *   - タスク状態（state）をJSONとしてファイルに保存する
 *   - TTLに基づいて期限切れのチェックポイントを自動削除する
 *   - 保存数上限に達した場合、優先度と作成日時に基づいて削除対象を選定する
 *   - 中断ポイントからのタスク再開を可能にする
 * why_it_exists:
 *   - プロセスの中断やプリエンプション後にタスク状態を復元するため
 *   - ディスク容量を管理し、古いデータを自動的にクリーンアップするため
 *   - 複数の並列タスクやエージェントチームの状態を一貫して管理するため
 * scope:
 *   in: タスクID、状態データ、TTL、優先度、メタデータ
 *   out: シリアライズされたJSONファイル、チェックポイント統計情報
 */

// File: .pi/lib/checkpoint-manager.ts
// Description: Checkpoint management for long-running tasks with TTL-based cleanup.
// Why: Enables task state persistence and recovery for preemption and resumption.
// Related: .pi/lib/task-scheduler.ts, .pi/extensions/agent-runtime.ts

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * チェックポイントのソース種別
 * @summary ソース種別を取得
 * @returns ソース種別
 */
export type CheckpointSource =
  | "subagent_run"
  | "subagent_run_parallel"
  | "agent_team_run"
  | "agent_team_run_parallel";

/**
 * チェックポイント優先度定義
 * @summary チェックポイント優先度を定義
 * @typedef {"critical"|"high"|"normal"|"low"|"background"} CheckpointPriority
 */
export type CheckpointPriority = "critical" | "high" | "normal" | "low" | "background";

/**
 * チェックポイントエンティティ
 * @summary チェックポイント定義
 * @property {string} id ID
 * @property {string} taskId タスクID
 * @property {string} source ソース
 * @property {string} provider プロバイダ
 * @property {string} model モデル
 */
export interface Checkpoint {
  /** Unique checkpoint identifier */
  id: string;
  /** Associated task identifier */
  taskId: string;
  /** Source tool that created this task */
  source: CheckpointSource;
  /** Provider name (e.g., "anthropic") */
  provider: string;
  /** Model name (e.g., "claude-sonnet-4") */
  model: string;
  /** Task priority level */
  priority: CheckpointPriority;
  /** Task-specific state (serialized as JSON) */
  state: unknown;
  /** Progress indicator (0.0 = start, 1.0 = complete) */
  progress: number;
  /** Checkpoint creation timestamp (ms since epoch) */
  createdAt: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
  /** Optional metadata for debugging */
  metadata?: Record<string, unknown>;
}

/**
 * チェックポイント保存結果
 * @summary 保存結果
 * @property {boolean} success 成功したか
 * @property {string} checkpointId チェックポイントID
 * @property {string} path 保存先パス
 */
export interface CheckpointSaveResult {
  success: boolean;
  checkpointId: string;
  path: string;
  error?: string;
}

/**
 * 割り込み処理の結果
 * @summary 割り込み結果
 * @property {boolean} success 成功したか
 * @property {string} [checkpointId] チェックポイントID
 * @property {string} [error] エラーメッセージ
 */
export interface PreemptionResult {
  success: boolean;
  checkpointId?: string;
  error?: string;
  resumedFromCheckpoint?: boolean;
}

/**
 * チェックポイント管理設定
 * @summary 設定を定義
 * @param {string} checkpointDir 保存ディレクトリパス
 * @param {number} defaultTtlMs デフォルトTTL（ミリ秒）
 * @param {number} maxCheckpoints 最大保存数
 * @param {number} cleanupIntervalMs 自動クリーンアップ間隔
 */
export interface CheckpointManagerConfig {
  /** Directory for storing checkpoint files */
  checkpointDir: string;
  /** Default TTL for checkpoints (ms) */
  defaultTtlMs: number;
  /** Maximum number of checkpoints to retain */
  maxCheckpoints: number;
  /** Interval for automatic cleanup (ms) */
  cleanupIntervalMs: number;
}

/**
 * チェックポイント統計情報
 * @summary 統計情報取得
 * @property {number} totalCount 総チェックポイント数
 * @property {number} totalSizeBytes 総サイズ（バイト）
 * @property {number} oldestCreatedAt 最古の作成日時
 * @property {number} newestCreatedAt 最新の作成日時
 * @property {Object} bySource ソース別の内訳
 */
export interface CheckpointStats {
  totalCount: number;
  totalSizeBytes: number;
  oldestCreatedAt: number | null;
  newestCreatedAt: number | null;
  bySource: Record<CheckpointSource, number>;
  byPriority: Record<CheckpointPriority, number>;
  expiredCount: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: CheckpointManagerConfig = {
  checkpointDir: ".pi/checkpoints",
  defaultTtlMs: 86_400_000, // 24 hours
  maxCheckpoints: 100,
  cleanupIntervalMs: 3_600_000, // 1 hour
};

const CHECKPOINT_FILE_EXTENSION = ".checkpoint.json";

// ============================================================================
// State
// ============================================================================

/** インメモリLRUキャッシュの最大エントリ数 */
const CACHE_MAX_ENTRIES = 100;

let managerState: {
  config: CheckpointManagerConfig;
  checkpointDir: string;
  cleanupTimer?: ReturnType<typeof setInterval>;
  initialized: boolean;
  /** インメモリキャッシュ: taskId -> Checkpoint */
  cache: Map<string, Checkpoint>;
  /** キャッシュのLRU順序管理用キー配列 */
  cacheOrder: string[];
} | null = null;

/**
 * キャッシュからチェックポイントを取得
 */
function getFromCache(taskId: string): Checkpoint | null {
  if (!managerState) return null;
  const cached = managerState.cache.get(taskId);
  if (cached) {
    // LRU: アクセスされたエントリを末尾に移動
    const idx = managerState.cacheOrder.indexOf(taskId);
    if (idx >= 0) {
      managerState.cacheOrder.splice(idx, 1);
      managerState.cacheOrder.push(taskId);
    }
  }
  return cached ?? null;
}

/**
 * キャッシュからチェックポイントを削除
 */
function deleteFromCache(taskId: string): void {
  if (!managerState) return;
  if (managerState.cache.has(taskId)) {
    managerState.cache.delete(taskId);
    const idx = managerState.cacheOrder.indexOf(taskId);
    if (idx >= 0) {
      managerState.cacheOrder.splice(idx, 1);
    }
  }
}

/**
 * キャッシュにチェックポイントを保存
 */
function setToCache(taskId: string, checkpoint: Checkpoint): void {
  if (!managerState) return;
  
  // 既存の場合は削除してから追加（LRU更新）
  if (managerState.cache.has(taskId)) {
    const idx = managerState.cacheOrder.indexOf(taskId);
    if (idx >= 0) {
      managerState.cacheOrder.splice(idx, 1);
    }
  }
  
  managerState.cache.set(taskId, checkpoint);
  managerState.cacheOrder.push(taskId);
  
  // 最大エントリ数を超えた場合、最も古いエントリを削除
  while (managerState.cacheOrder.length > CACHE_MAX_ENTRIES) {
    const oldestKey = managerState.cacheOrder.shift();
    if (oldestKey) {
      managerState.cache.delete(oldestKey);
    }
  }
}

/**
 * キャッシュからチェックポイントを削除
 */
function removeFromCache(taskId: string): void {
  if (!managerState) return;
  managerState.cache.delete(taskId);
  const idx = managerState.cacheOrder.indexOf(taskId);
  if (idx >= 0) {
    managerState.cacheOrder.splice(idx, 1);
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Resolve checkpoint directory path.
 * Supports both relative and absolute paths.
 */
function resolveCheckpointDir(baseDir: string): string {
  if (baseDir.startsWith("/") || baseDir.startsWith("~")) {
    return baseDir.replace("~", homedir());
  }
  // Relative to project root
  return join(process.cwd(), baseDir);
}

/**
 * Ensure checkpoint directory exists.
 */
function ensureCheckpointDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Generate a unique checkpoint ID.
 */
function generateCheckpointId(taskId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `cp-${taskId.slice(0, 16)}-${timestamp}-${random}`;
}

/**
 * Get checkpoint file path from checkpoint ID.
 */
function getCheckpointPath(dir: string, checkpointId: string): string {
  return join(dir, `${checkpointId}${CHECKPOINT_FILE_EXTENSION}`);
}

/**
 * Find latest checkpoint by task ID.
 */
function findLatestCheckpointByTaskId(
  dir: string,
  taskId: string,
): Checkpoint | null {
  if (!existsSync(dir)) {
    return null;
  }

  const files = readdirSync(dir).filter((f) =>
    f.endsWith(CHECKPOINT_FILE_EXTENSION),
  );
  const candidates: Checkpoint[] = [];

  for (const file of files) {
    const checkpoint = parseCheckpointFile(join(dir, file));
    if (checkpoint && checkpoint.taskId === taskId) {
      candidates.push(checkpoint);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.createdAt - a.createdAt);
  return candidates[0];
}

/**
 * Parse checkpoint file.
 */
function parseCheckpointFile(filePath: string): Checkpoint | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as Checkpoint;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Check if checkpoint is expired.
 */
function isCheckpointExpired(checkpoint: Checkpoint, nowMs: number): boolean {
  const expiresAt = checkpoint.createdAt + checkpoint.ttlMs;
  return nowMs > expiresAt;
}

/**
 * Get checkpoint file size in bytes.
 */
function getFileSizeBytes(filePath: string): number {
  try {
    const stats = statSync(filePath);
    return stats.size ?? 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// Checkpoint Manager Implementation
// ============================================================================

/**
 * チェックポイントマネージャーを初期化
 * @summary マネージャー初期化
 * @param {Partial<CheckpointManagerConfig>} [configOverrides] - 設定の上書きオプション
 * @returns なし
 */
export function initCheckpointManager(
  configOverrides?: Partial<CheckpointManagerConfig>
): void {
  if (managerState?.initialized) {
    return;
  }

  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const checkpointDir = resolveCheckpointDir(config.checkpointDir);

  ensureCheckpointDir(checkpointDir);

  // Start cleanup timer
  const cleanupTimer = setInterval(() => {
    cleanupExpiredCheckpoints().catch(() => {
      // Ignore cleanup errors
    });
  }, config.cleanupIntervalMs);
  cleanupTimer.unref();

  managerState = {
    config,
    checkpointDir,
    cleanupTimer,
    initialized: true,
    cache: new Map(),
    cacheOrder: [],
  };
}

/**
 * チェックポイントマネージャーのインスタンスを取得
 * @summary マネージャー取得
 * @returns チェックポイント操作用のメソッドを持つオブジェクト
 */
export function getCheckpointManager(): {
  save: (checkpoint: Omit<Checkpoint, "id" | "createdAt"> & { id?: string }) => Promise<CheckpointSaveResult>;
  load: (taskId: string) => Promise<Checkpoint | null>;
  loadById: (checkpointId: string) => Promise<Checkpoint | null>;
  delete: (taskId: string) => Promise<boolean>;
  listExpired: () => Promise<Checkpoint[]>;
  cleanup: () => Promise<number>;
  getStats: () => CheckpointStats;
} {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }

  return {
    save: saveCheckpoint,
    load: loadCheckpoint,
    loadById: loadCheckpointById,
    delete: deleteCheckpoint,
    listExpired: listExpiredCheckpoints,
    cleanup: cleanupExpiredCheckpoints,
    getStats: getCheckpointStats,
  };
}

/**
 * Save a checkpoint to disk.
 * Operation is idempotent - saving the same taskId overwrites the previous checkpoint.
 * 保存成功時はキャッシュも更新
 */
async function saveCheckpoint(
  checkpoint: Omit<Checkpoint, "id" | "createdAt"> & { id?: string }
): Promise<CheckpointSaveResult> {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }

  const dir = managerState!.checkpointDir;
  const nowMs = Date.now();
  
  // キャッシュから既存のチェックポイントを確認
  const cachedExisting = getFromCache(checkpoint.taskId);
  const existingCheckpoint = cachedExisting ?? findLatestCheckpointByTaskId(dir, checkpoint.taskId);

  const fullCheckpoint: Checkpoint = {
    // Reuse existing checkpoint ID for idempotent upsert by taskId.
    id: checkpoint.id ?? existingCheckpoint?.id ?? generateCheckpointId(checkpoint.taskId),
    taskId: checkpoint.taskId,
    source: checkpoint.source,
    provider: checkpoint.provider,
    model: checkpoint.model,
    priority: checkpoint.priority,
    state: checkpoint.state,
    progress: Math.max(0, Math.min(1, checkpoint.progress)),
    createdAt: nowMs,
    ttlMs: checkpoint.ttlMs ?? managerState!.config.defaultTtlMs,
    metadata: checkpoint.metadata,
  };

  const filePath = getCheckpointPath(dir, fullCheckpoint.id);

  try {
    // Ensure directory exists before write
    ensureCheckpointDir(dir);

    // Write checkpoint file
    writeFileSync(filePath, JSON.stringify(fullCheckpoint, null, 2), "utf-8");

    // キャッシュを更新
    setToCache(fullCheckpoint.taskId, fullCheckpoint);

    // Enforce max checkpoints limit
    await enforceMaxCheckpoints();

    return {
      success: true,
      checkpointId: fullCheckpoint.id,
      path: filePath,
    };
  } catch (error) {
    return {
      success: false,
      checkpointId: fullCheckpoint.id,
      path: filePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Load a checkpoint by task ID.
 * Returns the most recent checkpoint for the given task.
 * キャッシュを優先的に使用し、キャッシュミス時のみファイルから読み込む
 */
async function loadCheckpoint(taskId: string): Promise<Checkpoint | null> {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }

  // キャッシュから確認（O(1)）
  const cached = getFromCache(taskId);
  if (cached) {
    return cached;
  }

  const dir = managerState!.checkpointDir;

  if (!existsSync(dir)) {
    return null;
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(CHECKPOINT_FILE_EXTENSION));
  const candidates: Checkpoint[] = [];

  for (const file of files) {
    const checkpoint = parseCheckpointFile(join(dir, file));
    if (checkpoint && checkpoint.taskId === taskId) {
      candidates.push(checkpoint);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Return the most recent checkpoint and cache it
  candidates.sort((a, b) => b.createdAt - a.createdAt);
  const result = candidates[0];
  setToCache(taskId, result);
  return result;
}

/**
 * チェックポイントIDでチェックポイントをロードする
 * @summary IDでチェックポイントを取得
 * @param checkpointId - チェックポイントID
 * @returns チェックポイントオブジェクト、見つからない場合はnull
 */
async function loadCheckpointById(checkpointId: string): Promise<Checkpoint | null> {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }

  const dir = managerState!.checkpointDir;
  const filePath = getCheckpointPath(dir, checkpointId);

  if (!existsSync(filePath)) {
    return null;
  }

  return parseCheckpointFile(filePath);
}

/**
 * Delete a checkpoint by task ID.
 * Removes all checkpoints associated with the task.
 * キャッシュからも削除
 */
async function deleteCheckpoint(taskId: string): Promise<boolean> {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }

  // キャッシュから削除
  removeFromCache(taskId);

  const dir = managerState!.checkpointDir;

  if (!existsSync(dir)) {
    return false;
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(CHECKPOINT_FILE_EXTENSION));
  let deleted = false;

  for (const file of files) {
    const checkpoint = parseCheckpointFile(join(dir, file));
    if (checkpoint && checkpoint.taskId === taskId) {
      try {
        unlinkSync(join(dir, file));
        deleted = true;
      } catch {
        // Ignore deletion errors
      }
    }
  }

  return deleted;
}

/**
 * List all expired checkpoints.
 */
async function listExpiredCheckpoints(): Promise<Checkpoint[]> {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }

  const dir = managerState!.checkpointDir;

  if (!existsSync(dir)) {
    return [];
  }

  const nowMs = Date.now();
  const files = readdirSync(dir).filter((f) => f.endsWith(CHECKPOINT_FILE_EXTENSION));
  const expired: Checkpoint[] = [];

  for (const file of files) {
    const checkpoint = parseCheckpointFile(join(dir, file));
    if (checkpoint && isCheckpointExpired(checkpoint, nowMs)) {
      expired.push(checkpoint);
    }
  }

  return expired;
}

/**
 * Clean up expired checkpoints.
 * Returns the number of checkpoints deleted.
 */
async function cleanupExpiredCheckpoints(): Promise<number> {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }

  const dir = managerState!.checkpointDir;

  if (!existsSync(dir)) {
    return 0;
  }

  const expired = await listExpiredCheckpoints();
  let deletedCount = 0;

  for (const checkpoint of expired) {
    try {
      const filePath = getCheckpointPath(dir, checkpoint.id);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        deletedCount++;
      }
    } catch {
      // Ignore deletion errors
    }
  }

  return deletedCount;
}

/**
 * Enforce maximum checkpoint limit.
 * Removes oldest checkpoints if limit is exceeded.
 */
async function enforceMaxCheckpoints(): Promise<void> {
  if (!managerState?.initialized) {
    return;
  }

  const dir = managerState!.checkpointDir;
  const maxCheckpoints = managerState!.config.maxCheckpoints;

  if (!existsSync(dir)) {
    return;
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(CHECKPOINT_FILE_EXTENSION));

  if (files.length <= maxCheckpoints) {
    return;
  }

  // Load all checkpoints and sort by creation time
  const checkpoints: { checkpoint: Checkpoint; file: string }[] = [];

  for (const file of files) {
    const checkpoint = parseCheckpointFile(join(dir, file));
    if (checkpoint) {
      checkpoints.push({ checkpoint, file });
    }
  }

  checkpoints.sort((a, b) => b.checkpoint.createdAt - a.checkpoint.createdAt);

  // Remove oldest checkpoints
  const toRemove = checkpoints.slice(maxCheckpoints);

  for (const { checkpoint, file } of toRemove) {
    try {
      unlinkSync(join(dir, file));
      // キャッシュからも削除
      deleteFromCache(checkpoint.taskId);
    } catch {
      // Ignore deletion errors
    }
  }
}

/**
 * Get checkpoint statistics.
 */
function getCheckpointStats(): CheckpointStats {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }

  const dir = managerState!.checkpointDir;
  const nowMs = Date.now();

  const stats: CheckpointStats = {
    totalCount: 0,
    totalSizeBytes: 0,
    oldestCreatedAt: null,
    newestCreatedAt: null,
    bySource: {
      subagent_run: 0,
      subagent_run_parallel: 0,
      agent_team_run: 0,
      agent_team_run_parallel: 0,
    },
    byPriority: {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
      background: 0,
    },
    expiredCount: 0,
  };

  if (!existsSync(dir)) {
    return stats;
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(CHECKPOINT_FILE_EXTENSION));

  for (const file of files) {
    const filePath = join(dir, file);
    const checkpoint = parseCheckpointFile(filePath);

    if (!checkpoint) {
      continue;
    }

    stats.totalCount++;
    stats.totalSizeBytes += getFileSizeBytes(filePath);

    if (stats.oldestCreatedAt === null || checkpoint.createdAt < stats.oldestCreatedAt) {
      stats.oldestCreatedAt = checkpoint.createdAt;
    }

    if (stats.newestCreatedAt === null || checkpoint.createdAt > stats.newestCreatedAt) {
      stats.newestCreatedAt = checkpoint.createdAt;
    }

    // Count by source
    if (checkpoint.source in stats.bySource) {
      stats.bySource[checkpoint.source]++;
    }

    // Count by priority
    if (checkpoint.priority in stats.byPriority) {
      stats.byPriority[checkpoint.priority]++;
    }

    // Count expired
    if (isCheckpointExpired(checkpoint, nowMs)) {
      stats.expiredCount++;
    }
  }

  return stats;
}

/**
 * チェックポイントマネージャーをリセット
 * @summary マネージャーリセット
 * @returns なし
 */
export function resetCheckpointManager(): void {
  if (managerState?.cleanupTimer) {
    clearInterval(managerState.cleanupTimer);
  }
  managerState = null;
}

/**
 * 初期化状態を確認
 * @summary 初期化状態確認
 * @returns 初期化済みの場合はtrue、未初期化の場合はfalse
 */
export function isCheckpointManagerInitialized(): boolean {
  return managerState?.initialized ?? false;
}

/**
 * チェックポイントディレクトリを取得
 * @summary ディレクトリパス取得
 * @returns チェックポイント用ディレクトリのパス
 */
export function getCheckpointDir(): string {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }
  return managerState!.checkpointDir;
}

// ============================================================================
// Environment Variable Configuration
// ============================================================================

/**
 * 環境変数から設定を取得
 * @summary 設定を取得
 * @returns チェックポイントマネージャーの設定オブジェクト
 */
export function getCheckpointConfigFromEnv(): Partial<CheckpointManagerConfig> {
  const config: Partial<CheckpointManagerConfig> = {};

  const checkpointDir = process.env.PI_CHECKPOINT_DIR;
  if (checkpointDir) {
    config.checkpointDir = checkpointDir;
  }

  const defaultTtlMs = process.env.PI_CHECKPOINT_TTL_MS;
  if (defaultTtlMs) {
    const parsed = parseInt(defaultTtlMs, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      config.defaultTtlMs = parsed;
    }
  }

  const maxCheckpoints = process.env.PI_MAX_CHECKPOINTS;
  if (maxCheckpoints) {
    const parsed = parseInt(maxCheckpoints, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      config.maxCheckpoints = parsed;
    }
  }

  const cleanupIntervalMs = process.env.PI_CHECKPOINT_CLEANUP_MS;
  if (cleanupIntervalMs) {
    const parsed = parseInt(cleanupIntervalMs, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      config.cleanupIntervalMs = parsed;
    }
  }

  return config;
}

// Auto-initialize when environment overrides are provided.
const checkpointEnvConfig = getCheckpointConfigFromEnv();
if (Object.keys(checkpointEnvConfig).length > 0) {
  initCheckpointManager(checkpointEnvConfig);
}
