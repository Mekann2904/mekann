/**
 * @abdd.meta
 * path: .pi/lib/metrics-collector.ts
 * role: スケジューラの動作指標を収集・集計し、JSONL形式で永続化するライブラリ
 * why: タスクスケジューラのパフォーマンス可観測性を確保し、最適化のためのデータを提供するため
 * related: .pi/lib/task-scheduler.ts, .pi/extensions/agent-runtime.ts
 * public_api: SchedulerMetrics, TaskCompletionEvent, PreemptionEvent, WorkStealEvent, MetricsSummary インターフェース
 * invariants: タイムスタンプはミリ秒単位のエポック時間、ファイル操作は同期的に実行
 * side_effects: ログファイルの作成、追記、読み込み、削除によるファイルシステムの状態変更
 * failure_modes: ディスク容量不足による書き込み失敗、ログファイルの破損による集計エラー
 * @abdd.explain
 * overview: タスクスケジューラのパフォーマンスメトリクスを記録・集計・管理するモジュール
 * what_it_does:
 *   - タスク完了、プリエンプション、ワークスチールなどのイベントを定義・記録する
 *   - キューの深さ、待機時間、スループットなどのSchedulerMetricsを算出する
 *   - 指定された期間のMetricsSummaryを集計する
 *   - イベントデータをJSONL形式でローカルファイルシステムへ永続化する
 * why_it_exists:
 *   - スケジューラのボトルネックを特定するため
 *   - タスクの待機時間や実行時間の傾向を分析するため
 *   - システムの信頼性と効率を監視するため
 * scope:
 *   in: タスクイベントデータ（完了、プリエンプション、スチール）、集計対象の期間
 *   out: JSONL形式のログファイル、スケジューラ指標、期間サマリー
 */

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
 * スケジューラの指標
 * @summary スケジューラ指標
 * @type {object}
 * @property {number} timestamp - タイムスタンプ
 * @property {number} queueDepth - キューの深さ
 * @property {number} activeTasks - アクティブなタスク数
 * @property {number} avgWaitMs - 平均待機時間
 * @property {number} p50WaitMs - 待機時間の中央値
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
 * @summary タスク完了を記録
 * @param taskId タスクID
 * @param source 送信元
 * @param provider プロバイダ
 * @param model モデル
 * @param priority 優先度
 * @param waitedMs 待機時間（ミリ秒）
 * @param executionMs 実行時間（ミリ秒）
 * @param stealCount スチール回数
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
 * @summary プリエンプションを記録
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
 * ワークスチールイベント
 * @summary スチールイベントを保持
 * @param sourceInstance 送信元インスタンス
 * @param taskId タスクID
 * @param timestamp タイムスタンプ
 */
export interface WorkStealEvent {
  sourceInstance: string;
  taskId: string;
  timestamp: number;
}

/**
 * メトリクスサマリー情報
 * @summary 期間サマリーを保持
 * @param periodStartMs 期間開始時刻（ミリ秒）
 * @param periodEndMs 期間終了時刻（ミリ秒）
 * @param totalTasksCompleted 完了タスク総数
 * @param successRate 成功率
 * @param avgWaitMs 平均待機時間（ミリ秒）
 * @param avgExecutionMs 平均実行時間（ミリ秒）
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
 * メトリクス収集設定
 * @summary メトリクス設定を保持
 * @param metricsDir メトリクス保存ディレクトリ
 * @param collectionIntervalMs 収集間隔（ミリ秒）
 * @param maxLogFileSizeBytes ログ最大サイズ
 * @param maxLogFiles ログ最大ファイル数
 * @param enableLogging ログ出力有効化
 * @param totalSteals 総盗用数
 * @param totalRateLimitHits 総レートリミット回数
 * @param throughputPerMin 1分あたりスループット
 * @param byProvider プロバイダ別集計
 * @param byPriority 優先度別集計
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
 * ワークスチール統計
 * @summary ワークスチール統計
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
 * 初期化設定
 * @summary 初期化設定
 * @param {Partial<MetricsCollectorConfig>} [configOverrides] 設定オーバーライド
 * @returns {void}
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
 * メトリクス取得API
 * @summary メトリクス取得API
 * @returns {{ recordTaskCompletion: (task: { id: string; source: string; provider: string; model: string; priority: string }, result: { waitedMs: number; executionMs: number; success: boolean }) => void; recordPreemption: (taskId: string, reason: string) => void; recordWorkSteal: (sourceInstance: string, taskId: string) => void; recordRateLimitHit: () => void; updateQueueStats: (queueDepth: number, activeTasks: number) => void; getMetrics: () => SchedulerMetrics; getSummary: (periodMs: number) => MetricsSummary; getStealingStats: () => StealingStats; startCollection: (intervalMs?: number) => void; stopCollection: () => void; }} メトリクス操作API
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
  // Trim to WINDOW_SIZE to prevent unbounded growth
  if (collectorState.completionEvents.length > WINDOW_SIZE) {
    collectorState.completionEvents.shift();
  }

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
  // Trim to WINDOW_SIZE to prevent unbounded growth
  if (collectorState.preemptionEvents.length > WINDOW_SIZE) {
    collectorState.preemptionEvents.shift();
  }

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
  // Trim to WINDOW_SIZE to prevent unbounded growth
  if (collectorState.stealEvents.length > WINDOW_SIZE) {
    collectorState.stealEvents.shift();
  }
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
 * コレクタリセット
 * @summary コレクタリセット
 * @returns {void}
 */
export function resetMetricsCollector(): void {
  if (collectorState?.collectionTimer) {
    clearInterval(collectorState.collectionTimer);
  }
  collectorState = null;
}

/**
 * 初期化確認
 * @summary 初期化確認
 * @returns {boolean} 初期化済みかどうか
 */
export function isMetricsCollectorInitialized(): boolean {
  return collectorState?.initialized ?? false;
}

/**
 * @summary 盗用試行を記録
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
 * 環境変数から設定取得
 * @summary 設定を環境変数から取得
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

// Auto-initialize when environment overrides are provided.
const metricsEnvConfig = getMetricsConfigFromEnv();
if (Object.keys(metricsEnvConfig).length > 0) {
  initMetricsCollector(metricsEnvConfig);
}

// ============================================================================
// Parallel Execution Metrics (Enhanced)
// ============================================================================

/**
 * 並列実行メトリクス
 * @summary 並列実行の効率性を追跡
 */
export interface ParallelMetrics {
	/** 現在のアクティブ並列数 */
	activeConcurrent: number;
	/** 許可された並列数 */
	allowedConcurrent: number;
	/** ピーク並列数 */
	peakConcurrent: number;
	/** 平均待機時間（ミリ秒） */
	avgWaitTimeMs: number;
	/** 最大待機時間（ミリ秒） */
	maxWaitTimeMs: number;
	/** P95待機時間（ミリ秒） */
	p95WaitTimeMs: number;
	/** レートリミットヒット数 */
	rateLimitHits: number;
	/** レートリミット待機時間（ミリ秒） */
	rateLimitWaitsMs: number;
	/** 利用率（active / allowed） */
	utilizationRatio: number;
}

/**
 * 並列実行パターン別統計
 * @summary 並列実行パターンごとの統計情報
 */
export interface ParallelPatternStats {
	/** パターン名（subagent_run_parallel, agent_team_run_parallel, subagent_run_dag等） */
	pattern: string;
	/** 実行回数 */
	executionCount: number;
	/** 成功回数 */
	successCount: number;
	/** 失敗回数 */
	failureCount: number;
	/** 平均並列数 */
	avgParallelism: number;
	/** 要求並列数の合計 */
	totalRequestedParallelism: number;
	/** 実際の並列数の合計 */
	totalActualParallelism: number;
	/** 平均実行時間（ミリ秒） */
	avgExecutionTimeMs: number;
	/** 並列効率スコア（0.0-1.0） */
	efficiencyScore: number;
}

/**
 * 並列実行イベント
 * @summary 並列実行の開始/終了を記録
 */
export interface ParallelExecutionEvent {
	/** イベントID */
	eventId: string;
	/** パターン名 */
	pattern: string;
	/** イベントタイプ（start/end） */
	type: 'start' | 'end';
	/** タイムスタンプ */
	timestamp: number;
	/** 要求された並列数 */
	requestedParallelism: number;
	/** 実際の並列数（end時のみ） */
	actualParallelism?: number;
	/** 成功フラグ（end時のみ） */
	success?: boolean;
	/** 実行時間（ミリ秒、end時のみ） */
	executionTimeMs?: number;
}

// 並列実行メトリクスの内部状態
interface ParallelMetricsState {
	waitTimes: number[];
	rateLimitEvents: number;
	activeCount: number;
	peakCount: number;
	patternStats: Map<string, ParallelPatternStats>;
	activeExecutions: Map<string, { pattern: string; requestedParallelism: number; startTime: number }>;
}

const parallelState: ParallelMetricsState = {
	waitTimes: [],
	rateLimitEvents: 0,
	activeCount: 0,
	peakCount: 0,
	patternStats: new Map(),
	activeExecutions: new Map(),
};

const PARALLEL_METRICS_RING_BUFFER_SIZE = 1000;

/**
 * @summary 並列実行の開始を記録
 */
export function recordParallelExecutionStart(
	eventId: string,
	pattern: string,
	requestedParallelism: number
): void {
	parallelState.activeExecutions.set(eventId, {
		pattern,
		requestedParallelism,
		startTime: Date.now(),
	});

	// パターン統計を初期化（存在しない場合）
	if (!parallelState.patternStats.has(pattern)) {
		parallelState.patternStats.set(pattern, {
			pattern,
			executionCount: 0,
			successCount: 0,
			failureCount: 0,
			avgParallelism: 0,
			totalRequestedParallelism: 0,
			totalActualParallelism: 0,
			avgExecutionTimeMs: 0,
			efficiencyScore: 0,
		});
	}

	parallelState.activeCount++;
	parallelState.peakCount = Math.max(parallelState.peakCount, parallelState.activeCount);
}

/**
 * @summary 並列実行の終了を記録
 */
export function recordParallelExecutionEnd(
	eventId: string,
	actualParallelism: number,
	success: boolean
): void {
	const execution = parallelState.activeExecutions.get(eventId);
	if (!execution) return;

	const executionTimeMs = Date.now() - execution.startTime;
	parallelState.activeExecutions.delete(eventId);
	parallelState.activeCount = Math.max(0, parallelState.activeCount - 1);

	// パターン統計を更新
	const stats = parallelState.patternStats.get(execution.pattern);
	if (stats) {
		stats.executionCount++;
		if (success) {
			stats.successCount++;
		} else {
			stats.failureCount++;
		}
		stats.totalRequestedParallelism += execution.requestedParallelism;
		stats.totalActualParallelism += actualParallelism;
		stats.avgParallelism = stats.totalActualParallelism / stats.executionCount;
		stats.avgExecutionTimeMs =
			(stats.avgExecutionTimeMs * (stats.executionCount - 1) + executionTimeMs) / stats.executionCount;
		stats.efficiencyScore = stats.totalActualParallelism / stats.totalRequestedParallelism;
	}
}

/**
 * @summary 待機時間を記録
 */
export function recordParallelWaitTime(ms: number): void {
	parallelState.waitTimes.push(ms);
	// リングバッファ: 最新1000件を保持
	if (parallelState.waitTimes.length > PARALLEL_METRICS_RING_BUFFER_SIZE) {
		parallelState.waitTimes.shift();
	}
}

/**
 * @summary レートリミットイベントを記録
 */
export function recordParallelRateLimit(): void {
	parallelState.rateLimitEvents++;
}

/**
 * @summary 並列実行メトリクスのスナップショットを取得
 */
export function getParallelMetricsSnapshot(allowedConcurrent: number): ParallelMetrics {
	const sorted = [...parallelState.waitTimes].sort((a, b) => a - b);
	const p95Index = Math.floor(sorted.length * 0.95);

	return {
		activeConcurrent: parallelState.activeCount,
		allowedConcurrent,
		peakConcurrent: parallelState.peakCount,
		avgWaitTimeMs: average(parallelState.waitTimes),
		maxWaitTimeMs: sorted[sorted.length - 1] ?? 0,
		p95WaitTimeMs: sorted[p95Index] ?? 0,
		rateLimitHits: parallelState.rateLimitEvents,
		rateLimitWaitsMs: parallelState.waitTimes.reduce((a, b) => a + b, 0),
		utilizationRatio: allowedConcurrent > 0 ? parallelState.activeCount / allowedConcurrent : 0,
	};
}

/**
 * @summary パターン別統計を取得
 */
export function getParallelPatternStats(): ParallelPatternStats[] {
	return Array.from(parallelState.patternStats.values());
}

/**
 * @summary 並列メトリクスをリセット
 */
export function resetParallelMetrics(): void {
	parallelState.waitTimes = [];
	parallelState.rateLimitEvents = 0;
	parallelState.activeCount = 0;
	parallelState.peakCount = 0;
	parallelState.patternStats.clear();
	parallelState.activeExecutions.clear();
}

/**
 * 配列の平均値を計算
 */
function average(arr: number[]): number {
	if (arr.length === 0) return 0;
	return arr.reduce((a, b) => a + b, 0) / arr.length;
}
