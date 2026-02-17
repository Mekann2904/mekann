---
title: priority-scheduler
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# priority-scheduler

## 概要

`priority-scheduler` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `inferTaskType` | Infer task type from tool name. |
| 関数 | `estimateRounds` | Estimate the number of tool call rounds for a task |
| 関数 | `inferPriority` | Infer task priority from tool name and context. |
| 関数 | `comparePriority` | Compare two tasks for priority ordering. |
| 関数 | `formatPriorityQueueStats` | Create a formatted status string for priority queu |
| クラス | `PriorityTaskQueue` | Priority queue with WFQ-style scheduling. |
| インターフェース | `PriorityTaskMetadata` | Task metadata for priority scheduling. |
| インターフェース | `PriorityQueueEntry` | Priority queue entry with scheduling metadata. |
| インターフェース | `EstimationContext` | Context for round estimation. |
| インターフェース | `RoundEstimation` | Result of round estimation. |
| 型 | `TaskPriority` | Task priority levels for scheduling. |
| 型 | `TaskType` | Task type classification for round estimation. |
| 型 | `TaskComplexity` | Task complexity level. |

## 図解

### クラス図

```mermaid
classDiagram
  class PriorityTaskQueue {
    -entries: PriorityQueueEntry[]
    -virtualTime: number
    -maxSkipCount: number
    -starvationThresholdMs: number
    +enqueue
    +dequeue
    +peek
    +remove
    +getAll
  }
  class PriorityTaskMetadata {
    <<interface>>
    +id: string
    +toolName: string
    +priority: TaskPriority
    +estimatedDurationMs: number
    +estimatedRounds: number
  }
  class PriorityQueueEntry {
    <<interface>>
    +virtualStartTime: number
    +virtualFinishTime: number
    +skipCount: number
    +lastConsideredMs: number
  }
  class EstimationContext {
    <<interface>>
    +toolName: string
    +taskDescription: string
    +agentCount: number
    +isRetry: boolean
    +hasUnknownFramework: boolean
  }
  class RoundEstimation {
    <<interface>>
    +estimatedRounds: number
    +taskType: TaskType
    +complexity: TaskComplexity
    +confidence: number
  }
```

### 関数フロー

```mermaid
flowchart TD
  inferTaskType["inferTaskType()"]
  estimateRounds["estimateRounds()"]
  inferPriority["inferPriority()"]
  comparePriority["comparePriority()"]
  formatPriorityQueueStats["formatPriorityQueueStats()"]
  inferTaskType -.-> estimateRounds
  estimateRounds -.-> inferPriority
  inferPriority -.-> comparePriority
  comparePriority -.-> formatPriorityQueueStats
```

## 関数

### inferTaskType

```typescript
inferTaskType(toolName: string): TaskType
```

Infer task type from tool name.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolName | `string` | はい |

**戻り値**: `TaskType`

### estimateRounds

```typescript
estimateRounds(context: EstimationContext): RoundEstimation
```

Estimate the number of tool call rounds for a task.
Based on agent-estimation skill methodology.

Round estimation table:
- read/bash: 1 round (simple queries)
- edit/write: 2 rounds (code generation + verification)
- question: 1 round (user interaction)
- subagent_single: 5 rounds (delegation overhead)
- subagent_parallel: 3 + N*2 rounds (coordination)
- agent_team: 8 + N*3 rounds (team coordination)

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `EstimationContext` | はい |

**戻り値**: `RoundEstimation`

### inferPriority

```typescript
inferPriority(toolName: string, context?: {
    isInteractive?: boolean;
    isRetry?: boolean;
    isBackground?: boolean;
    agentCount?: number;
  }): TaskPriority
```

Infer task priority from tool name and context.

Priority inference rules:
- question: critical (user is waiting for response)
- subagent_run_parallel with multiple agents: high
- subagent_run: high
- read/bash/edit: normal
- Retries: low
- Background tasks: background

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolName | `string` | はい |
| context | `{
    isInteractive?: boolean;
    isRetry?: boolean;
    isBackground?: boolean;
    agentCount?: number;
  }` | いいえ |

**戻り値**: `TaskPriority`

### comparePriority

```typescript
comparePriority(a: PriorityQueueEntry, b: PriorityQueueEntry): number
```

Compare two tasks for priority ordering.
Returns negative if a should come before b, positive if b before a.

Comparison order:
1. Priority value (higher first)
2. Deadline (earlier first, if both have deadlines)
3. Enqueue time (earlier first, FIFO within same priority)
4. Estimated duration (shorter first, for SRT optimization)

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `PriorityQueueEntry` | はい |
| b | `PriorityQueueEntry` | はい |

**戻り値**: `number`

### formatPriorityQueueStats

```typescript
formatPriorityQueueStats(stats: ReturnType<PriorityTaskQueue["getStats"]>): string
```

Create a formatted status string for priority queue stats.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| stats | `ReturnType<PriorityTaskQueue["getStats"]>` | はい |

**戻り値**: `string`

## クラス

### PriorityTaskQueue

Priority queue with WFQ-style scheduling.

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| entries | `PriorityQueueEntry[]` | private |
| virtualTime | `number` | private |
| maxSkipCount | `number` | private |
| starvationThresholdMs | `number` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| enqueue | `enqueue(metadata): PriorityQueueEntry` |
| dequeue | `dequeue(): PriorityQueueEntry | undefined` |
| peek | `peek(): PriorityQueueEntry | undefined` |
| remove | `remove(id): PriorityQueueEntry | undefined` |
| getAll | `getAll(): PriorityQueueEntry[]` |
| getByPriority | `getByPriority(priority): PriorityQueueEntry[]` |
| getStats | `getStats(): {
    total: number;
    byPriority: Record<TaskPriority, number>;
    avgWaitMs: number;
    maxWaitMs: number;
    starvingCount: number;
  }` |
| promoteStarvingTasks | `promoteStarvingTasks(): number` |
| sort | `sort(): void` |
| getQueueVirtualTime | `getQueueVirtualTime(): number` |

## インターフェース

### PriorityTaskMetadata

```typescript
interface PriorityTaskMetadata {
  id: string;
  toolName: string;
  priority: TaskPriority;
  estimatedDurationMs?: number;
  estimatedRounds?: number;
  deadlineMs?: number;
  enqueuedAtMs: number;
  source?: "user-interactive" | "background" | "scheduled" | "retry";
}
```

Task metadata for priority scheduling.

### PriorityQueueEntry

```typescript
interface PriorityQueueEntry {
  virtualStartTime: number;
  virtualFinishTime: number;
  skipCount: number;
  lastConsideredMs?: number;
}
```

Priority queue entry with scheduling metadata.

### EstimationContext

```typescript
interface EstimationContext {
  toolName: string;
  taskDescription?: string;
  agentCount?: number;
  isRetry?: boolean;
  hasUnknownFramework?: boolean;
}
```

Context for round estimation.

### RoundEstimation

```typescript
interface RoundEstimation {
  estimatedRounds: number;
  taskType: TaskType;
  complexity: TaskComplexity;
  confidence: number;
}
```

Result of round estimation.

## 型定義

### TaskPriority

```typescript
type TaskPriority = "critical" | "high" | "normal" | "low" | "background"
```

Task priority levels for scheduling.
Higher priority tasks are scheduled before lower priority tasks.
"background" is the lowest priority for non-urgent tasks.

### TaskType

```typescript
type TaskType = | "read"      // Information retrieval
  | "bash"      // Command execution
  | "edit"      // Single file modification
  | "write"     // File creation
  | "subagent_single"   // Single agent delegation
  | "subagent_parallel" // Parallel agent delegation
  | "agent_team"        // Team execution
  | "question"  // User interaction
  | "unknown"
```

Task type classification for round estimation.

### TaskComplexity

```typescript
type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "exploratory"
```

Task complexity level.

---
*自動生成: 2026-02-17T21:54:59.816Z*
