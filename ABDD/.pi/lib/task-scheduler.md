---
title: Task Scheduler
category: reference
audience: developer
last_updated: 2026-02-18
tags: [scheduling, priority, preemption, rate-limiting]
related: [token-bucket, agent-runtime, priority-scheduler, checkpoint-manager]
---

# Task Scheduler

イベント駆動実行とプリエンプションサポートを備えた優先度ベースのタスクスケジューラ。

## 概要

プロバイダ/モデル固有のキューマネジメントによる効率的なタスクスケジューリングを可能にする。

## Types

### TaskSource

スケジュールされたタスクのソース種別。

```typescript
type TaskSource =
  | "subagent_run"
  | "subagent_run_parallel"
  | "agent_team_run"
  | "agent_team_run_parallel";
```

### TaskCostEstimate

スケジュールされたタスクのコスト見積もり。

```typescript
interface TaskCostEstimate {
  /** 推定トークン消費量 */
  estimatedTokens: number;
  /** 推定実行時間（ミリ秒） */
  estimatedDurationMs: number;
}
```

### ScheduledTask

優先度とレートリミットを持つ実行タスクのインターフェース。

```typescript
interface ScheduledTask<TResult = unknown> {
  /** ユニークなタスクID */
  id: string;
  /** このタスクを作成したソースツール */
  source: TaskSource;
  /** プロバイダー名（例: "anthropic"） */
  provider: string;
  /** モデル名（例: "claude-sonnet-4"） */
  model: string;
  /** タスク優先度レベル */
  priority: TaskPriority;
  /** レートリミット用のコスト見積もり */
  costEstimate: TaskCostEstimate;
  /** タスク実行関数 */
  execute: () => Promise<TResult>;
  /** キャンセル用のアボートシグナル（オプション） */
  signal?: AbortSignal;
  /** デッドラインタイムスタンプ（ミリ秒）（オプション） */
  deadlineMs?: number;
}
```

### TaskResult

スケジュールされたタスクの実行結果。

```typescript
interface TaskResult<TResult = unknown> {
  /** タスクID */
  taskId: string;
  /** タスクが正常に完了したか */
  success: boolean;
  /** タスク結果（成功時） */
  result?: TResult;
  /** エラーメッセージ（失敗時） */
  error?: string;
  /** 実行前のキュー待機時間（ms） */
  waitedMs: number;
  /** 実際の実行時間（ms） */
  executionMs: number;
  /** タイムアウトしたか */
  timedOut: boolean;
  /** アボートされたか */
  aborted: boolean;
}
```

### QueueStats

監視用のキュー統計。

```typescript
interface QueueStats {
  /** キュー内のタスク総数 */
  totalQueued: number;
  /** 優先度別のタスク数 */
  byPriority: Record<TaskPriority, number>;
  /** プロバイダー別のタスク数 */
  byProvider: Record<string, number>;
  /** 平均待機時間（ms） */
  avgWaitMs: number;
  /** 最大待機時間（ms） */
  maxWaitMs: number;
  /** スタベーションタスク数 */
  starvingCount: number;
  /** アクティブな実行数 */
  activeExecutions: number;
}
```

### SchedulerConfig

スケジューラ設定。

```typescript
interface SchedulerConfig {
  /** モデルあたりの最大並行実行数 */
  maxConcurrentPerModel: number;
  /** 全体の最大並行実行数 */
  maxTotalConcurrent: number;
  /** タスクのデフォルトタイムアウト（ms） */
  defaultTimeoutMs: number;
  /** スタベーション閾値（ms） */
  starvationThresholdMs: number;
  /** 昇格前の最大スキップ回数 */
  maxSkipCount: number;
}
```

### HybridSchedulerConfig

ハイブリッドスケジューリングアルゴリズムの設定。

```typescript
interface HybridSchedulerConfig {
  /** 優先度コンポーネントの重み (0.0 - 1.0) */
  priorityWeight: number;
  /** SJFコンポーネントの重み (0.0 - 1.0) */
  sjfWeight: number;
  /** フェアキューコンポーネントの重み (0.0 - 1.0) */
  fairQueueWeight: number;
  /** 正規化用の最大実行時間（ms） */
  maxDurationForNormalization: number;
  /** スキップあたりのスタベーションペナルティ */
  starvationPenaltyPerSkip: number;
  /** 最大スタベーションペナルティ */
  maxStarvationPenalty: number;
}
```

## Preemption Support

### PREEMPTION_MATRIX

どの優先度が他をプリエンプトできるかを定義するマトリックス。

- `critical` は high/normal/low/background をプリエンプト可能
- `high` は normal/low/background をプリエンプト可能
- その他はプリエンプト不可

### shouldPreempt()

```typescript
function shouldPreempt(
  runningTask: ScheduledTask,
  incomingTask: ScheduledTask
): boolean
```

### preemptTask()

```typescript
async function preemptTask(
  taskId: string,
  reason: string,
  state?: unknown,
  progress?: number
): Promise<PreemptionResult>
```

### resumeFromCheckpoint()

```typescript
async function resumeFromCheckpoint<TResult = unknown>(
  checkpointId: string,
  execute: (checkpoint: Checkpoint) => Promise<TResult>
): Promise<TaskResult<TResult>>
```

## TaskSchedulerImpl Class

イベント駆動の優先度キュータスクスケジューラ。

### Methods

#### submit()

タスクを実行用にサブミット。

```typescript
async submit<TResult>(task: ScheduledTask<TResult>): Promise<TaskResult<TResult>>
```

#### getStats()

現在のキュー統計を取得。

```typescript
getStats(): QueueStats
```

#### getActiveExecution()

アクティブな実行エントリをタスクIDで取得。

```typescript
getActiveExecution(taskId: string): TaskQueueEntry | null
```

#### removeActiveExecution()

アクティブな実行エントリを削除。

```typescript
removeActiveExecution(taskId: string): boolean
```

#### getAllActiveExecutions()

全アクティブ実行を取得。

```typescript
getAllActiveExecutions(): Map<string, TaskQueueEntry>
```

#### checkPreemptionNeeded()

プリエンプションが必要かチェック。

```typescript
checkPreemptionNeeded(incomingTask: ScheduledTask): ScheduledTask | null
```

#### attemptPreemption()

プリエンプションを試行。

```typescript
async attemptPreemption(
  incomingTask: ScheduledTask,
  checkpointState?: unknown,
  checkpointProgress?: number
): Promise<{ preempted: boolean; checkpointId?: string; error?: string }>
```

#### onPreemption()

プリエンプションイベントを購読。

```typescript
onPreemption(callback: (taskId: string, checkpointId: string) => void): () => void
```

## Factory Functions

### getScheduler()

シングルトンスケジューラインスタンスを取得。

```typescript
function getScheduler(): TaskSchedulerImpl
```

### createScheduler()

カスタム設定で新しいスケジューラを作成。

```typescript
function createScheduler(config?: Partial<SchedulerConfig>): TaskSchedulerImpl
```

### resetScheduler()

シングルトンスケジューラをリセット（テスト用）。

```typescript
function resetScheduler(): void
```

### createTaskId()

ユニークなタスクIDを作成。

```typescript
function createTaskId(prefix?: string): string
```

## Hybrid Scheduling

ハイブリッドスケジューリングは以下を組み合わせ:
- 優先度ベーススケジューリング
- SJF (Shortest Job First)
- フェアキューイング

最終スコア = (priority * 0.5) + (SJF * 0.3) + (FairQueue * 0.2) - starvationPenalty

## 使用例

```typescript
// タスクをサブミット
const result = await getScheduler().submit({
  id: createTaskId(),
  source: "subagent_run",
  provider: "anthropic",
  model: "claude-sonnet-4",
  priority: "high",
  costEstimate: { estimatedTokens: 1000, estimatedDurationMs: 5000 },
  execute: async () => {
    // タスク実行
    return "result";
  },
});

// 統計を取得
const stats = getScheduler().getStats();
console.log(`Queued: ${stats.totalQueued}, Active: ${stats.activeExecutions}`);
```

## 関連ファイル

- `.pi/lib/token-bucket.ts` - トークンバケットレートリミッター
- `.pi/lib/checkpoint-manager.ts` - チェックポイントマネージャ
- `.pi/lib/priority-scheduler.ts` - 優先度スケジューラ
- `.pi/extensions/agent-runtime.ts` - エージェントランタイム
