---
title: task-scheduler
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# task-scheduler

## 概要

`task-scheduler` モジュールのAPIリファレンス。

## インポート

```typescript
import { getCheckpointManager, Checkpoint, PreemptionResult... } from './checkpoint-manager';
import { TaskPriority, PriorityTaskQueue, comparePriority... } from './priority-scheduler';
import { PRIORITY_VALUES } from './priority-scheduler';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `shouldPreempt` | Check if an incoming task should preempt a running |
| 関数 | `preemptTask` | Preempt a running task, saving its state to a chec |
| 関数 | `resumeFromCheckpoint` | Resume a task from a checkpoint. |
| 関数 | `createTaskId` | Create a unique task ID. |
| 関数 | `getScheduler` | Get the singleton scheduler instance. |
| 関数 | `createScheduler` | Create a new scheduler with custom config. |
| 関数 | `resetScheduler` | Reset the singleton scheduler (for testing). |
| インターフェース | `TaskCostEstimate` | Cost estimate for a scheduled task. |
| インターフェース | `ScheduledTask` | Scheduled task interface. |
| インターフェース | `TaskResult` | Result of a scheduled task execution. |
| インターフェース | `QueueStats` | Queue statistics for monitoring. |
| インターフェース | `SchedulerConfig` | Scheduler configuration. |
| インターフェース | `HybridSchedulerConfig` | Configuration for hybrid scheduling algorithm. |
| 型 | `TaskSource` | Source type for scheduled tasks. |

## 図解

### クラス図

```mermaid
classDiagram
  class TaskSchedulerImpl {
    -config: SchedulerConfig
    -queues: Map_string_TaskQueue
    -activeExecutions: Map_string_TaskQueue
    -eventTarget: EventTarget
    -taskIdCounter: any
    +submit()
    +getStats()
    -getQueueKey()
    -sortQueue()
    -promoteStarvingTasks()
  }
  class TaskCostEstimate {
    <<interface>>
    +estimatedTokens: number
    +estimatedDurationMs: number
  }
  class ScheduledTask {
    <<interface>>
    +id: string
    +source: TaskSource
    +provider: string
    +model: string
    +priority: TaskPriority
  }
  class TaskResult {
    <<interface>>
    +taskId: string
    +success: boolean
    +result: TResult
    +error: string
    +waitedMs: number
  }
  class QueueStats {
    <<interface>>
    +totalQueued: number
    +byPriority: Record_TaskPriority
    +byProvider: Record_string_number
    +avgWaitMs: number
    +maxWaitMs: number
  }
  class TaskQueueEntry {
    <<interface>>
    +task: ScheduledTask_unknow
    +enqueuedAtMs: number
    +startedAtMs: number
    +completedAtMs: number
    +skipCount: number
  }
  class SchedulerConfig {
    <<interface>>
    +maxConcurrentPerModel: number
    +maxTotalConcurrent: number
    +defaultTimeoutMs: number
    +starvationThresholdMs: number
    +maxSkipCount: number
  }
  class HybridSchedulerConfig {
    <<interface>>
    +priorityWeight: number
    +sjfWeight: number
    +fairQueueWeight: number
    +maxDurationForNormalization: number
    +starvationPenaltyPerSkip: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[task-scheduler]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    checkpoint_manager["checkpoint-manager"]
    priority_scheduler["priority-scheduler"]
    priority_scheduler["priority-scheduler"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  shouldPreempt["shouldPreempt()"]
  preemptTask["preemptTask()"]
  resumeFromCheckpoint["resumeFromCheckpoint()"]
  createTaskId["createTaskId()"]
  getScheduler["getScheduler()"]
  createScheduler["createScheduler()"]
  shouldPreempt -.-> preemptTask
  preemptTask -.-> resumeFromCheckpoint
  resumeFromCheckpoint -.-> createTaskId
  createTaskId -.-> getScheduler
  getScheduler -.-> createScheduler
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant task_scheduler as "task-scheduler"
  participant checkpoint_manager as "checkpoint-manager"
  participant priority_scheduler as "priority-scheduler"

  Caller->>task_scheduler: shouldPreempt()
  task_scheduler->>checkpoint_manager: 内部関数呼び出し
  checkpoint_manager-->>task_scheduler: 結果
  task_scheduler-->>Caller: boolean

  Caller->>task_scheduler: preemptTask()
  activate task_scheduler
  task_scheduler-->>Caller: Promise_PreemptionRe
  deactivate task_scheduler
```

## 関数

### shouldPreempt

```typescript
shouldPreempt(runningTask: ScheduledTask, incomingTask: ScheduledTask): boolean
```

Check if an incoming task should preempt a running task.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| runningTask | `ScheduledTask` | はい |
| incomingTask | `ScheduledTask` | はい |

**戻り値**: `boolean`

### preemptTask

```typescript
async preemptTask(taskId: string, reason: string, state?: unknown, progress?: number): Promise<PreemptionResult>
```

Preempt a running task, saving its state to a checkpoint.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| taskId | `string` | はい |
| reason | `string` | はい |
| state | `unknown` | いいえ |
| progress | `number` | いいえ |

**戻り値**: `Promise<PreemptionResult>`

### resumeFromCheckpoint

```typescript
async resumeFromCheckpoint(checkpointId: string, execute: (checkpoint: Checkpoint) => Promise<TResult>): Promise<TaskResult<TResult>>
```

Resume a task from a checkpoint.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| checkpointId | `string` | はい |
| execute | `(checkpoint: Checkpoint) => Promise<TResult>` | はい |

**戻り値**: `Promise<TaskResult<TResult>>`

### createTaskId

```typescript
createTaskId(prefix: string): string
```

Create a unique task ID.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| prefix | `string` | はい |

**戻り値**: `string`

### priorityToValue

```typescript
priorityToValue(priority: TaskPriority): number
```

Get numeric priority value for comparison.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| priority | `TaskPriority` | はい |

**戻り値**: `number`

### computeSJFScore

```typescript
computeSJFScore(estimatedDurationMs: number, maxDurationMs: number): number
```

Compute SJF (Shortest Job First) score.
Normalized to [0, 1] where higher score = shorter job.
Edge case: maxDuration = 0 returns 1.0 (shortest possible).

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| estimatedDurationMs | `number` | はい |
| maxDurationMs | `number` | はい |

**戻り値**: `number`

### computeFairQueueScore

```typescript
computeFairQueueScore(enqueuedAtMs: number, estimatedTokens: number, priority: TaskPriority, currentTimeMs: number, maxTokens: number): number
```

Compute Fair Queue score based on Virtual Finish Time (VFT).
Tasks with higher wait time and fewer tokens get higher scores.
VFT = arrivalTime + (tokens / weight), where weight is based on priority.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| enqueuedAtMs | `number` | はい |
| estimatedTokens | `number` | はい |
| priority | `TaskPriority` | はい |
| currentTimeMs | `number` | はい |
| maxTokens | `number` | はい |

**戻り値**: `number`

### computeHybridScore

```typescript
computeHybridScore(entry: TaskQueueEntry, config: HybridSchedulerConfig, currentTimeMs: number): number
```

Compute hybrid scheduling score combining all factors.
finalScore = (priority * 0.5) + (SJF * 0.3) + (FairQueue * 0.2) - starvationPenalty

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| entry | `TaskQueueEntry` | はい |
| config | `HybridSchedulerConfig` | はい |
| currentTimeMs | `number` | はい |

**戻り値**: `number`

### compareHybridEntries

```typescript
compareHybridEntries(a: TaskQueueEntry, b: TaskQueueEntry, config: HybridSchedulerConfig): number
```

Compare two task entries using hybrid scheduling score.
Higher score = should be scheduled first.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `TaskQueueEntry` | はい |
| b | `TaskQueueEntry` | はい |
| config | `HybridSchedulerConfig` | はい |

**戻り値**: `number`

### compareTaskEntries

```typescript
compareTaskEntries(a: TaskQueueEntry, b: TaskQueueEntry): number
```

Compare two task entries for priority ordering.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `TaskQueueEntry` | はい |
| b | `TaskQueueEntry` | はい |

**戻り値**: `number`

### checkAndExecute

```typescript
async checkAndExecute(): void
```

**戻り値**: `void`

### onEvent

```typescript
onEvent(): void
```

**戻り値**: `void`

### onAbort

```typescript
onAbort(): void
```

**戻り値**: `void`

### cleanup

```typescript
cleanup(): void
```

**戻り値**: `void`

### handler

```typescript
handler(event: Event): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| event | `Event` | はい |

**戻り値**: `void`

### getScheduler

```typescript
getScheduler(): TaskSchedulerImpl
```

Get the singleton scheduler instance.

**戻り値**: `TaskSchedulerImpl`

### createScheduler

```typescript
createScheduler(config?: Partial<SchedulerConfig>): TaskSchedulerImpl
```

Create a new scheduler with custom config.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| config | `Partial<SchedulerConfig>` | いいえ |

**戻り値**: `TaskSchedulerImpl`

### resetScheduler

```typescript
resetScheduler(): void
```

Reset the singleton scheduler (for testing).

**戻り値**: `void`

## クラス

### TaskSchedulerImpl

Event-driven task scheduler with priority queue.

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| config | `SchedulerConfig` | private |
| queues | `Map<string, TaskQueueEntry[]>` | private |
| activeExecutions | `Map<string, TaskQueueEntry>` | private |
| eventTarget | `EventTarget` | private |
| taskIdCounter | `any` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| submit | `submit(task): Promise<TaskResult<TResult>>` |
| getStats | `getStats(): QueueStats` |
| getQueueKey | `getQueueKey(provider, model): string` |
| sortQueue | `sortQueue(queue): void` |
| promoteStarvingTasks | `promoteStarvingTasks(queue): number` |
| waitForExecution | `waitForExecution(entry, originalTask): Promise<TaskResult<TResult>>` |
| removeFromQueue | `removeFromQueue(queueKey, entry): void` |
| countActiveForModel | `countActiveForModel(provider, model): number` |
| waitForEvent | `waitForEvent(timeoutMs, signal): Promise<"event" | "timeout" | "aborted">` |
| getActiveExecution | `getActiveExecution(taskId): TaskQueueEntry | null` |
| removeActiveExecution | `removeActiveExecution(taskId): boolean` |
| getAllActiveExecutions | `getAllActiveExecutions(): Map<string, TaskQueueEntry>` |
| checkPreemptionNeeded | `checkPreemptionNeeded(incomingTask): ScheduledTask | null` |
| attemptPreemption | `attemptPreemption(incomingTask, checkpointState, checkpointProgress): Promise<{ preempted: boolean; checkpointId?: string; error?: string }>` |
| onPreemption | `onPreemption(callback): () => void` |

## インターフェース

### TaskCostEstimate

```typescript
interface TaskCostEstimate {
  estimatedTokens: number;
  estimatedDurationMs: number;
}
```

Cost estimate for a scheduled task.

### ScheduledTask

```typescript
interface ScheduledTask {
  id: string;
  source: TaskSource;
  provider: string;
  model: string;
  priority: TaskPriority;
  costEstimate: TaskCostEstimate;
  execute: () => Promise<TResult>;
  signal?: AbortSignal;
  deadlineMs?: number;
}
```

Scheduled task interface.
Represents a task to be executed with priority and rate limiting.

### TaskResult

```typescript
interface TaskResult {
  taskId: string;
  success: boolean;
  result?: TResult;
  error?: string;
  waitedMs: number;
  executionMs: number;
  timedOut: boolean;
  aborted: boolean;
}
```

Result of a scheduled task execution.

### QueueStats

```typescript
interface QueueStats {
  totalQueued: number;
  byPriority: Record<TaskPriority, number>;
  byProvider: Record<string, number>;
  avgWaitMs: number;
  maxWaitMs: number;
  starvingCount: number;
  activeExecutions: number;
}
```

Queue statistics for monitoring.

### TaskQueueEntry

```typescript
interface TaskQueueEntry {
  task: ScheduledTask<unknown>;
  enqueuedAtMs: number;
  startedAtMs?: number;
  completedAtMs?: number;
  skipCount: number;
}
```

Internal task entry for the queue.
Uses unknown type for task result to allow heterogeneous queue storage.

### SchedulerConfig

```typescript
interface SchedulerConfig {
  maxConcurrentPerModel: number;
  maxTotalConcurrent: number;
  defaultTimeoutMs: number;
  starvationThresholdMs: number;
  maxSkipCount: number;
}
```

Scheduler configuration.

### HybridSchedulerConfig

```typescript
interface HybridSchedulerConfig {
  priorityWeight: number;
  sjfWeight: number;
  fairQueueWeight: number;
  maxDurationForNormalization: number;
  starvationPenaltyPerSkip: number;
  maxStarvationPenalty: number;
}
```

Configuration for hybrid scheduling algorithm.
Combines priority, SJF (Shortest Job First), and fair queueing.

## 型定義

### TaskSource

```typescript
type TaskSource = | "subagent_run"
  | "subagent_run_parallel"
  | "agent_team_run"
  | "agent_team_run_parallel"
```

Source type for scheduled tasks.
Identifies which tool created this task.

---
*自動生成: 2026-02-18T00:15:35.770Z*
