---
title: priority-scheduler
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# priority-scheduler

## 概要

`priority-scheduler` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `inferTaskType` | ツール名からタスク種別を推測 |
| 関数 | `estimateRounds` | タスクの種類に基づいて推定ラウンド数を計算する |
| 関数 | `inferPriority` | ツール名とコンテキストからタスク優先度を推論する |
| 関数 | `comparePriority` | 優先度を比較して順序を決定する |
| 関数 | `formatPriorityQueueStats` | 優先度キューの統計情報をフォーマットする |
| クラス | `PriorityTaskQueue` | WFQ方式のタスク優先度キュー |
| インターフェース | `PriorityTaskMetadata` | 優先度スケジューリング用のタスクメタデータ |
| インターフェース | `PriorityQueueEntry` | WFQスケジューリング用の優先度キューエントリ |
| インターフェース | `EstimationContext` | ラウンド推定のコンテキスト情報 |
| インターフェース | `RoundEstimation` | ラウンド推定の結果 |
| 型 | `TaskPriority` | タスクスケジューリングの優先度レベル |
| 型 | `TaskType` | タスクの種類を表す型 |
| 型 | `TaskComplexity` | タスクの複雑度を表す型 |

## 図解

### クラス図

```mermaid
classDiagram
  class PriorityTaskQueue {
    -entries: PriorityQueueEntry
    -virtualTime: number
    -maxSkipCount: number
    -starvationThresholdMs: number
    +enqueue()
    +dequeue()
    +peek()
    +remove()
    +getAll()
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

ツール名からタスク種別を推測

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolName | `string` | はい |

**戻り値**: `TaskType`

### estimateRounds

```typescript
estimateRounds(context: EstimationContext): RoundEstimation
```

タスクの種類に基づいて推定ラウンド数を計算する

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

ツール名とコンテキストからタスク優先度を推論する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolName | `string` | はい |
| context | `object` | いいえ |
| &nbsp;&nbsp;↳ isInteractive | `boolean` | いいえ |
| &nbsp;&nbsp;↳ isRetry | `boolean` | いいえ |
| &nbsp;&nbsp;↳ isBackground | `boolean` | いいえ |
| &nbsp;&nbsp;↳ agentCount | `number` | いいえ |

**戻り値**: `TaskPriority`

### comparePriority

```typescript
comparePriority(a: PriorityQueueEntry, b: PriorityQueueEntry): number
```

優先度を比較して順序を決定する

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

優先度キューの統計情報をフォーマットする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| stats | `ReturnType<PriorityTaskQueue["getStats"]>` | はい |

**戻り値**: `string`

## クラス

### PriorityTaskQueue

WFQ方式のタスク優先度キュー

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

優先度スケジューリング用のタスクメタデータ

### PriorityQueueEntry

```typescript
interface PriorityQueueEntry {
  virtualStartTime: number;
  virtualFinishTime: number;
  skipCount: number;
  lastConsideredMs?: number;
}
```

WFQスケジューリング用の優先度キューエントリ

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

ラウンド推定のコンテキスト情報

### RoundEstimation

```typescript
interface RoundEstimation {
  estimatedRounds: number;
  taskType: TaskType;
  complexity: TaskComplexity;
  confidence: number;
}
```

ラウンド推定の結果

## 型定義

### TaskPriority

```typescript
type TaskPriority = "critical" | "high" | "normal" | "low" | "background"
```

タスクスケジューリングの優先度レベル

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

タスクの種類を表す型

### TaskComplexity

```typescript
type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "exploratory"
```

タスクの複雑度を表す型

---
*自動生成: 2026-02-18T07:17:30.468Z*
