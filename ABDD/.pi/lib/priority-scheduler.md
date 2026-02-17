---
title: Priority Scheduler
category: reference
audience: developer
last_updated: 2026-02-18
tags: [priority, scheduler, queue, wfq]
related: [subagents, agent-teams, agent-runtime]
---

# Priority Scheduler

優先度ベースのタスクスケジューリングユーティリティ。サブエージェントとエージェントチームの優先度対応スケジューリングを可能にする。

## 型定義

### TaskPriority

タスクの優先度レベル。

```typescript
type TaskPriority = "critical" | "high" | "normal" | "low" | "background";
```

### TaskType

タスクタイプの分類。

```typescript
type TaskType =
  | "read"      // 情報取得
  | "bash"      // コマンド実行
  | "edit"      // 単一ファイル変更
  | "write"     // ファイル作成
  | "subagent_single"   // 単一エージェント委任
  | "subagent_parallel" // 並列エージェント委任
  | "agent_team"        // チーム実行
  | "question"  // ユーザー対話
  | "unknown";  // 分類不可
```

### TaskComplexity

タスクの複雑さレベル。

```typescript
type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "exploratory";
```

### PriorityTaskMetadata

優先度スケジューリング用のタスクメタデータ。

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

### PriorityQueueEntry

スケジューリングメタデータを持つ優先度キューエントリ。

```typescript
interface PriorityQueueEntry extends PriorityTaskMetadata {
  virtualStartTime: number;
  virtualFinishTime: number;
  skipCount: number;
  lastConsideredMs?: number;
}
```

### EstimationContext

ラウンド推定のコンテキスト。

```typescript
interface EstimationContext {
  toolName: string;
  taskDescription?: string;
  agentCount?: number;
  isRetry?: boolean;
  hasUnknownFramework?: boolean;
}
```

### RoundEstimation

ラウンド推定の結果。

```typescript
interface RoundEstimation {
  estimatedRounds: number;
  taskType: TaskType;
  complexity: TaskComplexity;
  confidence: number; // 0.0 - 1.0
}
```

## 定数

### PRIORITY_WEIGHTS

Weighted Fair Queuing (WFQ) 用の優先度ウェイト。高い値 = より多くのスケジューリングウェイト = より頻繁な実行。

```typescript
export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 100,
  high: 50,
  normal: 25,
  low: 10,
  background: 5,
};
```

### PRIORITY_VALUES

比較用の優先度数値。高い値 = 高い優先度 = 先にスケジュール。

```typescript
export const PRIORITY_VALUES: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
  background: 0,
};
```

## 関数

### inferTaskType

ツール名からタスクタイプを推論する。

```typescript
function inferTaskType(toolName: string): TaskType
```

### estimateRounds

タスクのツール呼び出しラウンド数を推定する。agent-estimationスキルの方法論に基づく。

```typescript
function estimateRounds(context: EstimationContext): RoundEstimation
```

### inferPriority

ツール名とコンテキストからタスクの優先度を推論する。

```typescript
function inferPriority(
  toolName: string,
  context?: {
    isInteractive?: boolean;
    isRetry?: boolean;
    isBackground?: boolean;
    agentCount?: number;
  }
): TaskPriority
```

### comparePriority

2つのタスクを優先度順序で比較する。aがbより先に来る場合は負、bが先に来る場合は正を返す。

```typescript
function comparePriority(a: PriorityQueueEntry, b: PriorityQueueEntry): number
```

### formatPriorityQueueStats

優先度キュー統計のフォーマット済みステータス文字列を作成する。

```typescript
function formatPriorityQueueStats(stats: ReturnType<PriorityTaskQueue["getStats"]>): string
```

## クラス

### PriorityTaskQueue

WFQスタイルのスケジューリングを持つ優先度キュー。

#### メソッド

- `enqueue(metadata: PriorityTaskMetadata): PriorityQueueEntry` - タスクをキューに追加
- `dequeue(): PriorityQueueEntry | undefined` - 最高優先度のタスクを取り出す
- `peek(): PriorityQueueEntry | undefined` - 最高優先度のタスクを覗き見
- `remove(id: string): PriorityQueueEntry | undefined` - 特定のタスクをIDで削除
- `get length(): number` - 現在のキューサイズ
- `get isEmpty(): boolean` - キューが空かどうか
- `getAll(): PriorityQueueEntry[]` - 全エントリを取得
- `getByPriority(priority: TaskPriority): PriorityQueueEntry[]` - 優先度別にエントリを取得
- `getStats()` - キュー統計を取得
- `promoteStarvingTasks(): number` - 飢餓状態のタスクを昇格
