---
title: Task Dependencies
category: reference
audience: developer
last_updated: 2026-02-18
tags: [dag, dependencies, scheduling]
related: [priority-scheduler, agent-runtime]
---

# Task Dependencies

DAGベースのタスクスケジューリング用タスク依存グラフ。

## 概要

タスクが他のタスクの完了を待機できる、依存関係を考慮したスケジューリングを可能にする。

## Types

### TaskDependencyStatus

依存グラフ内のタスクステータス。

```typescript
type TaskDependencyStatus = "pending" | "ready" | "running" | "completed" | "failed" | "cancelled";
```

### TaskDependencyNode

依存グラフ内のタスクノード。

```typescript
interface TaskDependencyNode {
  /** ユニークなタスク識別子 */
  id: string;
  /** 表示用のタスク名 */
  name?: string;
  /** 現在のステータス */
  status: TaskDependencyStatus;
  /** このタスクが実行可能になる前に完了すべきタスクIDのセット */
  dependencies: Set<string>;
  /** このタスクに依存するタスクIDのセット */
  dependents: Set<string>;
  /** タスク追加時のタイムスタンプ */
  addedAt: number;
  /** タスク開始時のタイムスタンプ */
  startedAt?: number;
  /** タスク完了時のタイムスタンプ */
  completedAt?: number;
  /** タスク失敗時のエラー */
  error?: Error;
  /** スケジューリング優先度 */
  priority?: "critical" | "high" | "normal" | "low";
  /** 推定所要時間（ミリ秒） */
  estimatedDurationMs?: number;
}
```

### AddTaskOptions

グラフへのタスク追加オプション。

```typescript
interface AddTaskOptions {
  /** 表示用タスク名 */
  name?: string;
  /** 先に完了すべきタスクID */
  dependencies?: string[];
  /** スケジューリング優先度 */
  priority?: "critical" | "high" | "normal" | "low";
  /** 推定所要時間 */
  estimatedDurationMs?: number;
}
```

### CycleDetectionResult

サイクル検出結果。

```typescript
interface CycleDetectionResult {
  hasCycle: boolean;
  cyclePath: string[] | null;
}
```

## TaskDependencyGraph Class

サイクル検出とトポロジカルソート機能を持つタスク依存グラフ。

### Constructor

デフォルトコンストラクタ。

### Methods

#### addTask()

タスクを依存グラフに追加。

```typescript
addTask(id: string, options?: AddTaskOptions): TaskDependencyNode
```

**Throws:**
- タスクが既に存在する場合
- 依存タスクが存在しない場合

#### removeTask()

タスクをグラフから削除。

```typescript
removeTask(id: string): boolean
```

**Throws:** 実行中のタスクは削除不可

#### hasTask()

タスクが存在するか確認。

```typescript
hasTask(id: string): boolean
```

#### getTask()

IDによるタスク取得。

```typescript
getTask(id: string): TaskDependencyNode | undefined
```

#### getAllTasks()

全タスクを取得。

```typescript
getAllTasks(): TaskDependencyNode[]
```

#### isTaskReady()

タスクが実行可能か（全依存タスクが完了しているか）確認。

```typescript
isTaskReady(id: string): boolean
```

#### getReadyTasks()

実行可能な全タスクを取得。

```typescript
getReadyTasks(): TaskDependencyNode[]
```

#### getReadyTaskIds()

実行可能なタスクIDを取得。

```typescript
getReadyTaskIds(): string[]
```

#### markRunning()

タスクを実行中としてマーク。

```typescript
markRunning(id: string): void
```

**Throws:** タスクが存在しない、またはready状態でない場合

#### markCompleted()

タスクを完了としてマーク。依存タスクのready状態を更新。

```typescript
markCompleted(id: string): void
```

#### markFailed()

タスクを失敗としてマーク。依存タスクにも失敗を伝播。

```typescript
markFailed(id: string, error?: Error): void
```

#### markCancelled()

タスクをキャンセルとしてマーク。依存タスクにもキャンセルを伝播。

```typescript
markCancelled(id: string): void
```

#### detectCycle()

グラフ内のサイクルを検出。DFS with coloring (white/gray/black)を使用。

```typescript
detectCycle(): CycleDetectionResult
```

#### getTopologicalOrder()

全タスクのトポロジカル順序を取得。サイクルがある場合はnullを返す。

```typescript
getTopologicalOrder(): string[] | null
```

#### getStats()

グラフの統計情報を取得。

```typescript
getStats(): {
  total: number;
  byStatus: Record<TaskDependencyStatus, number>;
  readyCount: number;
  blockedCount: number;
  completedCount: number;
  failedCount: number;
  maxDepth: number;
}
```

#### clear()

全タスクをクリア。

```typescript
clear(): void
```

#### export()

シリアライズ用のオブジェクトとしてエクスポート。

```typescript
export(): {
  tasks: Array<{
    id: string;
    name?: string;
    status: TaskDependencyStatus;
    dependencies: string[];
    priority?: string;
  }>;
}
```

#### import()

エクスポートデータからインポート。

```typescript
import(data: { tasks: Array<{ id: string; name?: string; dependencies?: string[]; priority?: string }> }): void
```

**Throws:** サイクルまたは欠損依存関係が検出された場合

## Utility Functions

### formatDependencyGraphStats()

依存グラフ統計を表示用にフォーマット。

```typescript
function formatDependencyGraphStats(
  stats: ReturnType<TaskDependencyGraph["getStats"]>
): string
```

## 使用例

```typescript
const graph = new TaskDependencyGraph();

// タスクを追加
graph.addTask("task-a", { name: "Setup" });
graph.addTask("task-b", { name: "Process", dependencies: ["task-a"] });
graph.addTask("task-c", { name: "Cleanup", dependencies: ["task-b"] });

// サイクルチェック
const { hasCycle } = graph.detectCycle();

// 実行ループ
while (graph.getReadyTasks().length > 0) {
  const task = graph.getReadyTasks()[0];
  graph.markRunning(task.id);
  
  try {
    await executeTask(task);
    graph.markCompleted(task.id);
  } catch (error) {
    graph.markFailed(task.id, error);
  }
}
```

## 関連ファイル

- `.pi/lib/priority-scheduler.ts` - 優先度スケジューラ
- `.pi/extensions/agent-runtime.ts` - エージェントランタイム
