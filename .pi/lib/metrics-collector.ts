// File: .pi/lib/metrics-collector.ts
// Description: Scheduler metrics collection with JSONL logging and aggregation.
// Why: Enables observability of task scheduler performance for optimization.
// Related: .pi/lib/task-scheduler.ts, .pi/extensions/agent-runtime.ts

import { existsSync, mkdirSync, appendFileSync, readdirSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

 /**
  * スケジューラーのメトリクス
  * @param timestamp メトリクス収集時刻（エポックからのミリ秒）
  * @param queueDepth 現在のキューディープス
  * @param activeTasks アクティブなタスク数
  * @param avgWaitMs 平均待機時間（ミリ秒）
  * @param p50WaitMs P50待機時間（ミリ秒）
  * @param p99WaitMs P99待機時間（ミリ秒）
  * @param tasksCompletedPerMin 1分あたりの完了タスク数
  * @param rateLimitHits レートリミットのヒット数
  */
export interface SchedulerMetrics {
  /** Timestamp of metrics collection (ms since epoch) */
  timestamp: number;
  /** Current queue depth */
  queueDepth: number;
  /** Number of active tasks */
  activeTasks: number;
  /** Average wait time (ms) */
  avgWaitMs: number;
  /** P50 wait time (ms) */
  p50WaitMs: number;
  /** P99 wait time (ms) */
  p99WaitMs: number;
  /** Tasks completed per minute */
  tasksCompletedPerMin: number;
  /** Number of rate limit hits */
  rateLimitHits: number;
  /** Number of preemptions */
  preemptCount: number;
  /** Number of work steals */
  stealCount: number;
}

 /**
  * メトリクス用タスク完了イベント
  * @param taskId タスクID
  * @param source ソース
  * @param provider プロバイダ
  * @param model モデル
  * @param priority 優先度
  * @param waitedMs 待機時間（ミリ秒）
  * @param executionMs 実行時間（ミリ秒）
  * @param success 成功したかどうか
  * @param timestamp タイムスタンプ
  */
export interface TaskCompletionEvent {
  taskId: string;
  source: string;
  provider: string;
  model: string;
  priority: string;
  waitedMs: number;
  executionMs: number;
  success: boolean;
  timestamp: number;
}

 /**
  * プリエンプションイベント
  * @param taskId タスクID
  * @param reason プリエンプションの理由
  * @param timestamp タイムスタンプ
  */
export interface PreemptionEvent {
  taskId: string;
  reason: string;
  timestamp: number;
}

 /**
  * ワークスティールイベント
  * @param sourceInstance 送信元インスタンスID
  * @param taskId タスクID
  * @param timestamp タイムスタンプ
  */
export interface WorkStealEvent {
  sourceInstance: string;
  taskId: string;
  timestamp: number;
}

 /**
  * 指定期間のメトリクス集計結果を表します。
  * @param periodStartMs 期間開始時刻（ミリ秒）
  * @param periodEndMs 期間終了時刻（ミリ秒）
  * @param totalTasksCompleted 完了タスク総数
  * @param successRate 成功率
  * @param avgWaitMs 平均待機時間（ミリ秒）
  * @param avgExecutionMs 平均実行時間（ミリ秒）
  * @param p50WaitMs 待機時間の中央値（ミリ秒）
  * @param p99WaitMs 待機時間の99パーセンタイル（ミリ秒）
  * @param p99ExecutionMs 実行時間の99パーセンタイル（ミリ秒）
  * @param totalPreemptions 総プリエンプション回数
  * @param totalSteals 総スティール回数
  * @param totalRateLimitHits 総レートリミットヒット回数
  * @param throughputPerMin 1分あたりのスループット
  * @param byProvider プロバイダ別の集計情報
  * @param byPriority 優先度別の集計情報
  */
export interface MetricsSummary {
  periodStartMs: number;
  periodEndMs: number;
  totalTasksCompleted: number;
  successRate: number;
  avgWaitMs: number;
  avgExecutionMs: number;
  p50WaitMs: number;
  p99WaitMs: number;
  p99ExecutionMs: number;
  totalPreemptions: number;
  totalSteals: number;
  totalRateLimitHits: number;
  throughputPerMin: number;
  byProvider: Record<string, { count: number; avgWaitMs: number; avgExecutionMs: number }>;
  byPriority: Record<string, { count: number; avgWaitMs: number; avgExecutionMs: number }>;
}

 /**
  * メトリクス収集の設定
  * @param metricsDir メトリクスログの保存ディレクトリ
  * @param collectionIntervalMs 収集間隔 (ミリ秒)
  * @param maxLogFileSizeBytes ログローテーションのファイルサイズ上限 (バイト)
  * @param maxLogFiles 保持するログファイルの最大数
  * @param enableLogging JSONLログを有効にするかどうか
  */
export interface MetricsCollectorConfig {
  /** Directory for storing metrics logs */
  metricsDir: string;
  /** Collection interval (ms) */
  collectionIntervalMs: number;
  /** Maximum log file size before rotation (bytes) */
  maxLogFileSizeBytes: number;
  /** Maximum number of log files to retain */
  maxLogFiles: number;
  /** Enable JSONL logging */
  enableLogging: boolean;
}

 /**
  * ワークスティーリングの統計情報
  * @param totalAttempts 総試行回数
  * @param successfulSteals 成功回数
  * @param failedAttempts 失敗回数
  * @param successRate 成功率
  * @param avgLatencyMs 平均レイテンシ（ms）
  * @param lastStealAt 最終スティール日時
  */
export interface StealingStats {
  totalAttempts: number;
  successfulSteals: number;
  failedAttempts: number;
  successRate: number;
  avgLatencyMs: number;
  lastStealAt: number | null;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: MetricsCollectorConfig = {
  metricsDir: ".pi/metrics",
  collectionIntervalMs: 60_000, // 1 minute
  maxLogFileSizeBytes: 10 * 1024 * 1024, // 10 MB
  maxLogFiles: 10,
  enableLogging: true,
};

const METRICS_FILE_PREFIX = "scheduler-metrics-";
const METRICS_FILE_EXTENSION = ".jsonl";

// ============================================================================
// State
// ============================================================================

interface MetricsWindowState {
  waitTimes: number[];
  executionTimes: number[];
  taskCompletions: number;
  preemptions: number;
  steals: number;
  rateLimitHits: number;
  windowStartMs: number;
}

interface CollectorState {
  config: MetricsCollectorConfig;
  metricsDir: string;
  collectionTimer?: ReturnType<typeof setInterval>;
  initialized: boolean;
  // Rolling window for metrics (last N samples)
  window: MetricsWindowState;
  // Event buffers
  completionEvents: TaskCompletionEvent[];
  preemptionEvents: PreemptionEvent[];
  stealEvents: WorkStealEvent[];
  // Counters
  totalCompletions: number;
  totalPreemptions: number;
  totalSteals: number;
  totalRateLimitHits: number;
  // Stealing stats
  stealingAttempts: number;
  successfulSteals: number;
  stealLatencies: number[];
  lastStealAt: number | null;
  // Current metrics (from scheduler)
  currentQueueDepth: number;
  currentActiveTasks: number;
}

let collectorState: CollectorState | null = null;

const WINDOW_SIZE = 1000; // Keep last 1000 samples for percentile calculation
const ONE_MINUTE_MS = 60_000;

// ============================================================================
// Utilities
// ============================================================================

/**
 * Resolve metrics directory path.
 */
function resolveMetricsDir(baseDir: string): string {
  if (baseDir.startsWith("/") || baseDir.startsWith("~")) {
    return baseDir.replace("~", homedir());
  }
  return join(process.cwd(), baseDir);
}

/**
 * Ensure metrics directory exists.
 */
function ensureMetricsDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get current timestamp in milliseconds.
 */
function nowMs(): number {
  return Date.now();
}

/**
 * Calculate percentile of a sorted array.
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

/**
 * Get current metrics log file path.
 */
function getCurrentLogFilePath(dir: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(dir, `${METRICS_FILE_PREFIX}${date}${METRICS_FILE_EXTENSION}`);
}

/**
 * Append JSONL entry to log file.
 */
function appendJsonlEntry(filePath: string, entry: Record<string, unknown>): void {
  try {
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(filePath, line, "utf-8");
  } catch {
    // Ignore write errors
  }
}

/**
 * Rotate log files if needed.
 */
function rotateLogFilesIfNeeded(dir: string, config: MetricsCollectorConfig): void {
  if (!existsSync(dir)) return;

  const currentFile = getCurrentLogFilePath(dir);

  // Check current file size
  if (existsSync(currentFile)) {
    try {
      const stats = statSync(currentFile);
      if (stats.size >= config.maxLogFileSizeBytes) {
        // Rotate: rename current file with timestamp
        const timestamp = Date.now();
        const rotatedName = `${METRICS_FILE_PREFIX}${new Date().toISOString().slice(0, 10)}-${timestamp}${METRICS_FILE_EXTENSION}`;
        try {
          require("fs").renameSync(currentFile, join(dir, rotatedName));
        } catch {
          // Ignore rotation errors
        }
      }
    } catch {
      // Ignore stat errors
    }
  }

  // Clean up old log files
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(METRICS_FILE_PREFIX) && f.endsWith(METRICS_FILE_EXTENSION))
    .sort()
    .reverse();

  if (files.length > config.maxLogFiles) {
    const toRemove = files.slice(config.maxLogFiles);
    for (const file of toRemove) {
      try {
        unlinkSync(join(dir, file));
      } catch {
        // Ignore deletion errors
      }
    }
  }
}

// ============================================================================
// Metrics Collector Implementation
// ============================================================================

 /**
  * メトリクスコレクタを初期化する
  * @param configOverrides デフォルト設定を上書きするオプション
  * @returns なし
  */
export function initMetricsCollector(
  configOverrides?: Partial<MetricsCollectorConfig>
): void {
  if (collectorState?.initialized) {
    return;
  }

  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const metricsDir = resolveMetricsDir(config.metricsDir);

  ensureMetricsDir(metricsDir);

  collectorState = {
    config,
    metricsDir,
    initialized: true,
    window: {
      waitTimes: [],
      executionTimes: [],
      taskCompletions: 0,
      preemptions: 0,
      steals: 0,
      rateLimitHits: 0,
      windowStartMs: nowMs(),
    },
    completionEvents: [],
    preemptionEvents: [],
    stealEvents: [],
    totalCompletions: 0,
    totalPreemptions: 0,
    totalSteals: 0,
    totalRateLimitHits: 0,
    stealingAttempts: 0,
    successfulSteals: 0,
    stealLatencies: [],
    lastStealAt: null,
    currentQueueDepth: 0,
    currentActiveTasks: 0,
  };
}

 /**
  * メトリクス収集インスタンスを取得（必要なら初期化）
  * @returns メトリクス収集機能を持つインスタンス
  */
export function getMetricsCollector(): {
  recordTaskCompletion: (task: { id: string; source: string; provider: string; model: string; priority: string }, result: { waitedMs: number; executionMs: number; success: boolean }) => void;
  recordPreemption: (taskId: string, reason: string) => void;
  recordWorkSteal: (sourceInstance: string, taskId: string) => void;
  recordRateLimitHit: () => void;
  updateQueueStats: (queueDepth: number, activeTasks: number) => void;
  getMetrics: () => SchedulerMetrics;
  getSummary: (periodMs: number) => MetricsSummary;
  getStealingStats: () => StealingStats;
  startCollection: (intervalMs?: number) => void;
  stopCollection: () => void;
} {
  if (!collectorState?.initialized) {
    initMetricsCollector();
  }

  return {
    recordTaskCompletion,
    recordPreemption,
    recordWorkSteal,
    recordRateLimitHit,
    updateQueueStats,
    getMetrics,
    getSummary,
    getStealingStats,
    startCollection,
    stopCollection,
  };
}

/**
 * Record a task completion event.
 */
function recordTaskCompletion(
  task: { id: string; source: string; provider: string; model: string; priority: string },
  result: { waitedMs: number; executionMs: number; success: boolean }
): void {
  if (!collectorState?.initialized) return;

  const event: TaskCompletionEvent = {
    taskId: task.id,
    source: task.source,
    provider: task.provider,
    model: task.model,
    priority: task.priority,
    waitedMs: result.waitedMs,
    executionMs: result.executionMs,
    success: result.success,
    timestamp: nowMs(),
  };

  // Update window
  collectorState.window.waitTimes.push(event.waitedMs);
  collectorState.window.executionTimes.push(event.executionMs);
  collectorState.window.taskCompletions++;

  // Trim window if needed
  if (collectorState.window.waitTimes.length > WINDOW_SIZE) {
    collectorState.window.waitTimes.shift();
    collectorState.window.executionTimes.shift();
  }

  // Update counters
  collectorState.totalCompletions++;
  collectorState.completionEvents.push(event);

  // Log to JSONL
  if (collectorState.config.enableLogging) {
    const filePath = getCurrentLogFilePath(collectorState.metricsDir);
    appendJsonlEntry(filePath, { type: "task_completion", ...event });
    rotateLogFilesIfNeeded(collectorState.metricsDir, collectorState.config);
  }
}

/**
 * Record a preemption event.
 */
function recordPreemption(taskId: string, reason: string): void {
  if (!collectorState?.initialized) return;

  const event: PreemptionEvent = {
    taskId,
    reason,
    timestamp: nowMs(),
  };

  collectorState.window.preemptions++;
  collectorState.totalPreemptions++;
  collectorState.preemptionEvents.push(event);

  // Log to JSONL
  if (collectorState.config.enableLogging) {
    const filePath = getCurrentLogFilePath(collectorState.metricsDir);
    appendJsonlEntry(filePath, { type: "preemption", ...event });
  }
}

/**
 * Record a work steal event.
 */
function recordWorkSteal(sourceInstance: string, taskId: string): void {
  if (!collectorState?.initialized) return;

  const event: WorkStealEvent = {
    sourceInstance,
    taskId,
    timestamp: nowMs(),
  };

  collectorState.window.steals++;
  collectorState.totalSteals++;
  collectorState.stealEvents.push(event);
  collectorState.successfulSteals++;
  collectorState.lastStealAt = event.timestamp;

  // Log to JSONL
  if (collectorState.config.enableLogging) {
    const filePath = getCurrentLogFilePath(collectorState.metricsDir);
    appendJsonlEntry(filePath, { type: "work_steal", ...event });
  }
}

/**
 * Record a rate limit hit.
 */
function recordRateLimitHit(): void {
  if (!collectorState?.initialized) return;

  collectorState.window.rateLimitHits++;
  collectorState.totalRateLimitHits++;

  // Log to JSONL
  if (collectorState.config.enableLogging) {
    const filePath = getCurrentLogFilePath(collectorState.metricsDir);
    appendJsonlEntry(filePath, {
      type: "rate_limit_hit",
      timestamp: nowMs(),
    });
  }
}

/**
 * Update queue statistics (called by scheduler).
 */
function updateQueueStats(queueDepth: number, activeTasks: number): void {
  if (!collectorState?.initialized) return;

  collectorState.currentQueueDepth = queueDepth;
  collectorState.currentActiveTasks = activeTasks;
}

/**
 * Get current metrics snapshot.
 */
function getMetrics(): SchedulerMetrics {
  if (!collectorState?.initialized) {
    initMetricsCollector();
  }

  const state = collectorState!;

  // Calculate percentiles
  const sortedWaitTimes = [...state.window.waitTimes].sort((a, b) => a - b);
  const avgWaitMs = sortedWaitTimes.length > 0
    ? sortedWaitTimes.reduce((sum, v) => sum + v, 0) / sortedWaitTimes.length
    : 0;
  const p50WaitMs = percentile(sortedWaitTimes, 50);
  const p99WaitMs = percentile(sortedWaitTimes, 99);

  // Calculate throughput (tasks per minute)
  const windowDurationMs = nowMs() - state.window.windowStartMs;
  const tasksCompletedPerMin = windowDurationMs > 0
    ? (state.window.taskCompletions / windowDurationMs) * ONE_MINUTE_MS
    : 0;

  return {
    timestamp: nowMs(),
    queueDepth: state.currentQueueDepth,
    activeTasks: state.currentActiveTasks,
    avgWaitMs: Math.round(avgWaitMs),
    p50WaitMs: Math.round(p50WaitMs),
    p99WaitMs: Math.round(p99WaitMs),
    tasksCompletedPerMin: Math.round(tasksCompletedPerMin * 10) / 10,
    rateLimitHits: state.window.rateLimitHits,
    preemptCount: state.window.preemptions,
    stealCount: state.window.steals,
  };
}

/**
 * Get metrics summary for a time period.
 */
function getSummary(periodMs: number): MetricsSummary {
  if (!collectorState?.initialized) {
    initMetricsCollector();
  }

  const state = collectorState!;
  const now = nowMs();
  const periodStart = now - periodMs;

  // Filter events in period
  const recentCompletions = state.completionEvents.filter((e) => e.timestamp >= periodStart);
  const recentPreemptions = state.preemptionEvents.filter((e) => e.timestamp >= periodStart);
  const recentSteals = state.stealEvents.filter((e) => e.timestamp >= periodStart);

  // Calculate aggregate stats
  const totalTasksCompleted = recentCompletions.length;
  const successfulTasks = recentCompletions.filter((e) => e.success).length;
  const successRate = totalTasksCompleted > 0 ? successfulTasks / totalTasksCompleted : 0;

  const waitTimes = recentCompletions.map((e) => e.waitedMs).sort((a, b) => a - b);
  const executionTimes = recentCompletions.map((e) => e.executionMs).sort((a, b) => a - b);

  const avgWaitMs = waitTimes.length > 0
    ? waitTimes.reduce((sum, v) => sum + v, 0) / waitTimes.length
    : 0;
  const avgExecutionMs = executionTimes.length > 0
    ? executionTimes.reduce((sum, v) => sum + v, 0) / executionTimes.length
    : 0;

  const p50WaitMs = percentile(waitTimes, 50);
  const p99WaitMs = percentile(waitTimes, 99);
  const p99ExecutionMs = percentile(executionTimes, 99);

  const throughputPerMin = periodMs > 0
    ? (totalTasksCompleted / periodMs) * ONE_MINUTE_MS
    : 0;

  // Group by provider
  const byProvider: Record<string, { count: number; avgWaitMs: number; avgExecutionMs: number }> = {};
  for (const event of recentCompletions) {
    const key = event.provider;
    if (!byProvider[key]) {
      byProvider[key] = { count: 0, avgWaitMs: 0, avgExecutionMs: 0 };
    }
    byProvider[key].count++;
    byProvider[key].avgWaitMs += event.waitedMs;
    byProvider[key].avgExecutionMs += event.executionMs;
  }
  for (const key of Object.keys(byProvider)) {
    const entry = byProvider[key];
    entry.avgWaitMs = Math.round(entry.avgWaitMs / entry.count);
    entry.avgExecutionMs = Math.round(entry.avgExecutionMs / entry.count);
  }

  // Group by priority
  const byPriority: Record<string, { count: number; avgWaitMs: number; avgExecutionMs: number }> = {};
  for (const event of recentCompletions) {
    const key = event.priority;
    if (!byPriority[key]) {
      byPriority[key] = { count: 0, avgWaitMs: 0, avgExecutionMs: 0 };
    }
    byPriority[key].count++;
    byPriority[key].avgWaitMs += event.waitedMs;
    byPriority[key].avgExecutionMs += event.executionMs;
  }
  for (const key of Object.keys(byPriority)) {
    const entry = byPriority[key];
    entry.avgWaitMs = Math.round(entry.avgWaitMs / entry.count);
    entry.avgExecutionMs = Math.round(entry.avgExecutionMs / entry.count);
  }

  return {
    periodStartMs: periodStart,
    periodEndMs: now,
    totalTasksCompleted,
    successRate: Math.round(successRate * 1000) / 1000,
    avgWaitMs: Math.round(avgWaitMs),
    avgExecutionMs: Math.round(avgExecutionMs),
    p50WaitMs: Math.round(p50WaitMs),
    p99WaitMs: Math.round(p99WaitMs),
    p99ExecutionMs: Math.round(p99ExecutionMs),
    totalPreemptions: recentPreemptions.length,
    totalSteals: recentSteals.length,
    totalRateLimitHits: state.totalRateLimitHits,
    throughputPerMin: Math.round(throughputPerMin * 10) / 10,
    byProvider,
    byPriority,
  };
}

/**
 * Get work stealing statistics.
 */
function getStealingStats(): StealingStats {
  if (!collectorState?.initialized) {
    initMetricsCollector();
  }

  const state = collectorState!;

  const totalAttempts = state.stealingAttempts;
  const successfulSteals = state.successfulSteals;
  const failedAttempts = totalAttempts - successfulSteals;
  const successRate = totalAttempts > 0 ? successfulSteals / totalAttempts : 0;

  const avgLatencyMs = state.stealLatencies.length > 0
    ? state.stealLatencies.reduce((sum, v) => sum + v, 0) / state.stealLatencies.length
    : 0;

  return {
    totalAttempts,
    successfulSteals,
    failedAttempts,
    successRate: Math.round(successRate * 1000) / 1000,
    avgLatencyMs: Math.round(avgLatencyMs),
    lastStealAt: state.lastStealAt,
  };
}

/**
 * Start periodic metrics collection.
 */
function startCollection(intervalMs?: number): void {
  if (!collectorState?.initialized) {
    initMetricsCollector();
  }

  const state = collectorState!;

  // Stop existing timer
  if (state.collectionTimer) {
    clearInterval(state.collectionTimer);
  }

  const interval = intervalMs ?? state.config.collectionIntervalMs;

  state.collectionTimer = setInterval(() => {
    collectAndLogMetrics();
  }, interval);

  state.collectionTimer.unref();
}

/**
 * Stop periodic metrics collection.
 */
function stopCollection(): void {
  if (!collectorState?.initialized) return;

  if (collectorState.collectionTimer) {
    clearInterval(collectorState.collectionTimer);
    collectorState.collectionTimer = undefined;
  }
}

/**
 * Collect and log current metrics.
 */
function collectAndLogMetrics(): void {
  if (!collectorState?.initialized) return;
  if (!collectorState.config.enableLogging) return;

  const metrics = getMetrics();
  const filePath = getCurrentLogFilePath(collectorState.metricsDir);
  appendJsonlEntry(filePath, { type: "metrics_snapshot", ...metrics });
  rotateLogFilesIfNeeded(collectorState.metricsDir, collectorState.config);
}

 /**
  * メトリクス収集器の状態をリセットする（テスト用）。
  * @returns void
  */
export function resetMetricsCollector(): void {
  if (collectorState?.collectionTimer) {
    clearInterval(collectorState.collectionTimer);
  }
  collectorState = null;
}

 /**
  * メトリクスコレクターが初期化済みか確認
  * @returns 初期化済みの場合はtrue、そうでない場合はfalse
  */
export function isMetricsCollectorInitialized(): boolean {
  return collectorState?.initialized ?? false;
}

 /**
  * 盗用試行を記録する
  * @param success 成功したかどうか
  * @param latencyMs レイテンシ（ミリ秒）
  * @returns なし
  */
export function recordStealingAttempt(success: boolean, latencyMs?: number): void {
  if (!collectorState?.initialized) return;

  collectorState.stealingAttempts++;

  if (success) {
    collectorState.successfulSteals++;
    collectorState.lastStealAt = nowMs();
  }

  if (latencyMs !== undefined) {
    collectorState.stealLatencies.push(latencyMs);
    if (collectorState.stealLatencies.length > WINDOW_SIZE) {
      collectorState.stealLatencies.shift();
    }
  }
}

// ============================================================================
// Environment Variable Configuration
// ============================================================================

 /**
  * 環境変数からメトリクス設定を取得
  * @returns メトリクス収集の設定情報
  */
export function getMetricsConfigFromEnv(): Partial<MetricsCollectorConfig> {
  const config: Partial<MetricsCollectorConfig> = {};

  const metricsDir = process.env.PI_METRICS_DIR;
  if (metricsDir) {
    config.metricsDir = metricsDir;
  }

  const intervalMs = process.env.PI_METRICS_INTERVAL_MS;
  if (intervalMs) {
    const parsed = parseInt(intervalMs, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      config.collectionIntervalMs = parsed;
    }
  }

  const maxLogFileSize = process.env.PI_METRICS_MAX_FILE_SIZE;
  if (maxLogFileSize) {
    const parsed = parseInt(maxLogFileSize, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      config.maxLogFileSizeBytes = parsed;
    }
  }

  const enableLogging = process.env.PI_METRICS_ENABLE_LOGGING;
  if (enableLogging !== undefined) {
    config.enableLogging = enableLogging !== "false";
  }

  return config;
}

// Auto-initialize with environment config if not already initialized
const state = collectorState;
if (!state?.initialized) {
  const envConfig = getMetricsConfigFromEnv();
  if (Object.keys(envConfig).length > 0) {
    initMetricsCollector(envConfig);
  }
}
