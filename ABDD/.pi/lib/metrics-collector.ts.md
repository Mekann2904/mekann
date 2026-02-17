---
title: Metrics Collector
category: reference
audience: developer
last_updated: 2026-02-18
tags: [metrics, scheduler, jsonl, logging]
related: [task-scheduler, checkpoint-manager]
---

# Metrics Collector

JSONLロギングと集計機能を持つスケジューラメトリクス収集モジュール。

## 概要

タスクスケジューラのパフォーマンス観測可能性を提供し、最適化を可能にする。

## 型定義

### SchedulerMetrics

スケジューラメトリクススナップショット。

```typescript
interface SchedulerMetrics {
  timestamp: number;            // 収集タイムスタンプ(ms)
  queueDepth: number;           // 現在のキューデプス
  activeTasks: number;          // アクティブタスク数
  avgWaitMs: number;            // 平均待機時間(ms)
  p50WaitMs: number;            // P50待機時間(ms)
  p99WaitMs: number;            // P99待機時間(ms)
  tasksCompletedPerMin: number; // 分間完了タスク数
  rateLimitHits: number;        // レート制限ヒット数
  preemptCount: number;         // プリエンプション数
  stealCount: number;           // ワークスチール数
}
```

### TaskCompletionEvent

メトリクス用のタスク完了イベント。

```typescript
interface TaskCompletionEvent {
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
```

### PreemptionEvent

メトリクス用のプリエンプションイベント。

```typescript
interface PreemptionEvent {
  taskId: string;
  reason: string;
  timestamp: number;
}
```

### WorkStealEvent

メトリクス用のワークスチールイベント。

```typescript
interface WorkStealEvent {
  sourceInstance: string;
  taskId: string;
  timestamp: number;
}
```

### MetricsSummary

期間全体のメトリクスサマリー。

```typescript
interface MetricsSummary {
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
```

### MetricsCollectorConfig

メトリクスコレクター設定。

```typescript
interface MetricsCollectorConfig {
  metricsDir: string;           // メトリクスログ保存ディレクトリ
  collectionIntervalMs: number; // 収集間隔(ms)
  maxLogFileSizeBytes: number;  // ログローテーション前の最大ファイルサイズ
  maxLogFiles: number;          // 保持する最大ログファイル数
  enableLogging: boolean;       // JSONLロギングの有効化
}
```

### StealingStats

ワークスチール調整用の統計。

```typescript
interface StealingStats {
  totalAttempts: number;
  successfulSteals: number;
  failedAttempts: number;
  successRate: number;
  avgLatencyMs: number;
  lastStealAt: number | null;
}
```

## 定数

```typescript
// デフォルト設定
const DEFAULT_CONFIG = {
  metricsDir: ".pi/metrics",
  collectionIntervalMs: 60000,     // 1分
  maxLogFileSizeBytes: 10 * 1024 * 1024,  // 10 MB
  maxLogFiles: 10,
  enableLogging: true
};

// ウィンドウサイズ（パーセンタイル計算用）
const WINDOW_SIZE = 1000;
```

## 関数

### initMetricsCollector(configOverrides)

メトリクスコレクターを初期化する。

```typescript
function initMetricsCollector(
  configOverrides?: Partial<MetricsCollectorConfig>
): void
```

### getMetricsCollector()

メトリクスコレクターインスタンスを取得する（必要に応じて初期化）。

```typescript
function getMetricsCollector(): {
  recordTaskCompletion: (task, result) => void;
  recordPreemption: (taskId, reason) => void;
  recordWorkSteal: (sourceInstance, taskId) => void;
  recordRateLimitHit: () => void;
  updateQueueStats: (queueDepth, activeTasks) => void;
  getMetrics: () => SchedulerMetrics;
  getSummary: (periodMs) => MetricsSummary;
  getStealingStats: () => StealingStats;
  startCollection: (intervalMs?) => void;
  stopCollection: () => void;
}
```

### resetMetricsCollector()

メトリクスコレクターの状態をリセットする（テスト用）。

```typescript
function resetMetricsCollector(): void
```

### isMetricsCollectorInitialized()

メトリクスコレクターが初期化されているか確認する。

```typescript
function isMetricsCollectorInitialized(): boolean
```

### recordStealingAttempt(success, latencyMs)

スチール試行を記録する（統計用）。

```typescript
function recordStealingAttempt(success: boolean, latencyMs?: number): void
```

### getMetricsConfigFromEnv()

環境変数からメトリクスコレクター設定を取得する。

```typescript
function getMetricsConfigFromEnv(): Partial<MetricsCollectorConfig>
```

**環境変数:**
| 変数 | 説明 |
|-----|------|
| PI_METRICS_DIR | メトリクスディレクトリ |
| PI_METRICS_INTERVAL_MS | 収集間隔(ms) |
| PI_METRICS_MAX_FILE_SIZE | 最大ファイルサイズ |
| PI_METRICS_ENABLE_LOGGING | ロギング有効化 |

## JSONLロギング

メトリクスはJSONL形式でログに記録される：

**ファイル命名:** `scheduler-metrics-YYYY-MM-DD.jsonl`

**イベントタイプ:**
- `task_completion` - タスク完了イベント
- `preemption` - プリエンプションイベント
- `work_steal` - ワークスチールイベント
- `rate_limit_hit` - レート制限ヒット
- `metrics_snapshot` - 定期メトリクススナップショット

## ログローテーション

- ファイルサイズが `maxLogFileSizeBytes` を超えるとローテーション
- 古いファイルは `maxLogFiles` まで保持

## 使用例

```typescript
import {
  initMetricsCollector,
  getMetricsCollector,
  getMetricsConfigFromEnv
} from "./metrics-collector.js";

// 環境設定で初期化
initMetricsCollector(getMetricsConfigFromEnv());

const collector = getMetricsCollector();

// 定期収集開始
collector.startCollection(60000);

// タスク完了記録
collector.recordTaskCompletion(
  { id: "task-1", source: "subagent", provider: "anthropic", model: "claude", priority: "normal" },
  { waitedMs: 100, executionMs: 5000, success: true }
);

// メトリクス取得
const metrics = collector.getMetrics();
console.log(`P99 wait: ${metrics.p99WaitMs}ms`);

// サマリー取得
const summary = collector.getSummary(3600000);  // 直近1時間
console.log(`Throughput: ${summary.throughputPerMin}/min`);
```

## 関連ファイル

- `./task-scheduler.ts` - タスクスケジューラー
- `./checkpoint-manager.ts` - チェックポイント管理
- `./cross-instance-coordinator.ts` - クロスインスタンス調整
