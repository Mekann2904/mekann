/**
 * @abdd.meta
 * path: .pi/lib/checkpoint-manager.ts
 * role: 長時間実行タスクの状態永続化・復旧を行うチェックポイント管理モジュール
 * why: タスクの途中状態を保存し、割り込みや障害発生時に再開可能にするため
 * related: .pi/lib/task-scheduler.ts, .pi/extensions/agent-runtime.ts
 * public_api: Checkpoint, CheckpointSaveResult, PreemptionResult, CheckpointManagerConfig, CheckpointSource, CheckpointPriority
 * invariants: progressは0.0〜1.0の範囲、ttlMsは正の整数、checkpointDirは有効なディレクトリパス
 * side_effects: ファイルシステムへの読み書き（チェックポイントの保存・削除）、ディレクトリ作成
 * failure_modes: ディスク容量不足による保存失敗、不正なJSONシリアライズ/デシリアライズ、期限切れチェックポイントの読み込み
 * @abdd.explain
 * overview: 長時間実行タスクのチェックポイントをTTLベースで管理し、状態の永続化と復旧を提供する
 * what_it_does:
 *   - Checkpoint型によるタスク状態の構造化定義（id, taskId, source, state, progress等）
 *   - TTLベースのチェックポイント自動クリーンアップ機能
 *   - 優先度レベル（critical, high, normal, low, background）によるタスク分類
 *   - 保存・復旧操作の結果をCheckpointSaveResult/PreemptionResultで返却
 * why_it_exists:
 *   - プリエンプション（割り込み）発生時のタスク状態保存を実現
 *   - 中断されたタスクをチェックポイントから再開可能にする
 *   - 複数のタスクソース（subagent_run, agent_team_run等）に対応した統一的な状態管理
 * scope:
 *   in: Checkpoint型の状態データ、CheckpointManagerConfigによる設定値
 *   out: CheckpointSaveResult, PreemptionResult, チェックポイント統計情報
 */

// File: .pi/lib/checkpoint-manager.ts
// Description: Checkpoint management for long-running tasks with TTL-based cleanup.
// Why: Enables task state persistence and recovery for preemption and resumption.
// Related: .pi/lib/task-scheduler.ts, .pi/extensions/agent-runtime.ts

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Source type for checkpointed tasks.
 * Must match TaskSource from task-scheduler.ts.
 */
export type CheckpointSource =
  | "subagent_run"
  | "subagent_run_parallel"
  | "agent_team_run"
  | "agent_team_run_parallel";

 /**
  * チェックポイントの優先度レベル
  */
export type CheckpointPriority = "critical" | "high" | "normal" | "low" | "background";

 /**
  * チェックポイント状態を表すインターフェース
  * @param id チェックポイントの一意な識別子
  * @param taskId 関連するタスクの識別子
  * @param source タスクを作成したソースツール
  * @param provider プロバイダ名（例: "anthropic"）
  * @param model モデル名（例: "claude-sonnet-4"）
  * @param priority タスクの優先度レベル
  * @param state タスク固有の状態（JSONとしてシリアライズ）
  * @param progress 進捗インジケーター（0.0 = 開始, 1.0 = 完了）
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
  * チェックポイント保存操作の結果
  * @param success 成功したかどうか
  * @param checkpointId チェックポイントID
  * @param path 保存先パス
  * @param error エラーメッセージ（失敗時）
  */
export interface CheckpointSaveResult {
  success: boolean;
  checkpointId: string;
  path: string;
  error?: string;
}

 /**
  * 割り込み操作の結果を表します
  * @param success 操作が成功したかどうか
  * @param checkpointId チェックポイントID
  * @param error エラーメッセージ
  * @param resumedFromCheckpoint チェックポイントから再開したかどうか
  */
export interface PreemptionResult {
  success: boolean;
  checkpointId?: string;
  error?: string;
  resumedFromCheckpoint?: boolean;
}

 /**
  * チェックポイントマネージャーの設定
  * @param checkpointDir チェックポイントファイルの保存ディレクトリ
  * @param defaultTtlMs チェックポイントのデフォルト存続期間（ミリ秒）
  * @param maxCheckpoints 保持するチェックポイントの最大数
  * @param cleanupIntervalMs 自動クリーニングの間隔（ミリ秒）
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
  * @param totalCount 総チェックポイント数
  * @param totalSizeBytes 総サイズ（バイト）
  * @param oldestCreatedAt 最古の作成日時
  * @param newestCreatedAt 最新の作成日時
  * @param bySource ソース別のカウント
  * @param byPriority 優先度別のカウント
  * @param expiredCount 有効期限切れの数
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

let managerState: {
  config: CheckpointManagerConfig;
  checkpointDir: string;
  cleanupTimer?: ReturnType<typeof setInterval>;
  initialized: boolean;
} | null = null;

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
    const stats = require("fs").statSync(filePath);
    return stats.size ?? 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// Checkpoint Manager Implementation
// ============================================================================

 /**
  * チェックポイントマネージャーを初期化する
  * @param configOverrides デフォルト設定を上書きするオプション設定
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
  };
}

 /**
  * チェックポイントマネージャーを取得
  * @returns チェックポイント管理オブジェクト
  */
export function getCheckpointManager(): {
  save: (checkpoint: Omit<Checkpoint, "id" | "createdAt"> & { id?: string }) => Promise<CheckpointSaveResult>;
  load: (taskId: string) => Promise<Checkpoint | null>;
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
    delete: deleteCheckpoint,
    listExpired: listExpiredCheckpoints,
    cleanup: cleanupExpiredCheckpoints,
    getStats: getCheckpointStats,
  };
}

/**
 * Save a checkpoint to disk.
 * Operation is idempotent - saving the same taskId overwrites the previous checkpoint.
 */
async function saveCheckpoint(
  checkpoint: Omit<Checkpoint, "id" | "createdAt"> & { id?: string }
): Promise<CheckpointSaveResult> {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }

  const dir = managerState!.checkpointDir;
  const nowMs = Date.now();

  const fullCheckpoint: Checkpoint = {
    id: checkpoint.id ?? generateCheckpointId(checkpoint.taskId),
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
 */
async function loadCheckpoint(taskId: string): Promise<Checkpoint | null> {
  if (!managerState?.initialized) {
    initCheckpointManager();
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

  // Return the most recent checkpoint
  candidates.sort((a, b) => b.createdAt - a.createdAt);
  return candidates[0];
}

/**
 * Delete a checkpoint by task ID.
 * Removes all checkpoints associated with the task.
 */
async function deleteCheckpoint(taskId: string): Promise<boolean> {
  if (!managerState?.initialized) {
    initCheckpointManager();
  }

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

  for (const { file } of toRemove) {
    try {
      unlinkSync(join(dir, file));
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
  * チェックポイントマネージャをリセット
  * @returns 戻り値なし
  */
export function resetCheckpointManager(): void {
  if (managerState?.cleanupTimer) {
    clearInterval(managerState.cleanupTimer);
  }
  managerState = null;
}

 /**
  * チェックポイントマネージャーが初期化済みか判定
  * @returns 初期化済みの場合はtrue、未初期化の場合はfalse
  */
export function isCheckpointManagerInitialized(): boolean {
  return managerState?.initialized ?? false;
}

 /**
  * チェックポイントディレクトリのパスを取得する
  * @returns チェックポイントディレクトリのパス
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
  * 環境変数からチェックポイント設定を取得する。
  * @returns チェックポイントマネージャーの設定オブジェクト。
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

// Auto-initialize with environment config if not already initialized
const state = managerState;
if (!state?.initialized) {
  const envConfig = getCheckpointConfigFromEnv();
  if (Object.keys(envConfig).length > 0) {
    initCheckpointManager(envConfig);
  }
}
