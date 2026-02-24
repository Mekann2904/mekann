---
name: dyntaskmas
description: DynTaskMAS論文に基づく動的タスク割り当て・並列実行スキル。重み計算、優先度スケジューリング、コンテキスト管理、適応的ワークフローを統合。
license: MIT
tags: [dyntaskmas, dag, parallel, scheduling, adaptive]
metadata:
  skill-version: "1.0.0"
  paper-reference: "DynTaskMAS: Dynamic Task Assignment for Multi-Agent Systems"
---

# DynTaskMAS Skill

DynTaskMAS論文の4つのコアコンポーネントを統合したタスク実行スキル。

## Overview

DynTaskMAS（Dynamic Task Assignment for Multi-Agent Systems）は、マルチエージェントシステムにおける動的タスク割り当てと並列実行を最適化する手法論。本スキルは以下の改善を目標とする：

- 実行時間 21-33% 削減
- リソース利用率 35.4% 改善（65%→88%）
- 16エージェントまでニアリニアスケーリング

## Components

### 1. DTGG (Dynamic Task Graph Generator)

動的タスクグラフ生成器。タスクの依存関係を解析し、最適な実行順序を決定する。

**重み計算式:**
```
W(v_i, v_j) = α·C(v_j) + β·I(v_i, v_j)
```

- `C(v_j)`: タスク複雑性スコア
- `I(v_i, v_j)`: 依存関係重要度
- `α, β`: 重み係数（デフォルト: α=0.6, β=0.4）

**実装:** `.pi/lib/dag-weight-calculator.ts`

**主な関数:**
- `calculateComplexity()` - タスク複雑性スコア計算
- `calculateDependencyImportance()` - 依存関係重要度計算
- `calculateEdgeWeight()` - エッジ重み計算
- `calculateTaskPriority()` - タスク優先度計算

### 2. APEE (Asynchronous Parallel Execution Engine)

非同期並列実行エンジン。優先度ベースでタスクをスケジューリングし、スタベーションを防止する。

**優先度スケジューリング:**
```
P(v_i) = basePriority + criticalPathBonus - dependencyPenalty
```

**スタベーション防止:**
- 待機時間が `starvationPreventionInterval`（デフォルト30秒）を超えたタスクを優先実行

**実装:** `.pi/lib/priority-scheduler.ts`

**主なクラス/メソッド:**
- `PriorityScheduler` - スケジューラクラス
- `scheduleTasks()` - 優先度ベーススケジューリング
- `markCompleted()` - 完了記録

### 3. SACMS (Semantic-Aware Context Management System)

セマンティック対応コンテキスト管理システム。タスク間で必要なコンテキストのみを効率的に共有する。

**階層ツリー構造:**
```
root-task
├── subtask-1
│   ├── subtask-1-1
│   └── subtask-1-2
└── subtask-2
```

**関連性閾値:**
```
θ = 0.65
```

`similarity >= θ` のコンテキストのみを配布。

**実装:** `.pi/lib/context-repository.ts`

**主なクラス/メソッド:**
- `ContextRepository` - コンテキストリポジトリクラス
- `addContext()` - コンテキスト追加
- `getRelevantContext()` - 関連コンテキスト取得
- `compressContext()` - コンテキスト圧縮

### 4. AWM (Adaptive Workflow Manager)

適応的ワークフローマネージャ。システムパフォーマンスを監視し、動的にリソース配分を最適化する。

**パフォーマンススコア:**
```
M(t) = throughput * (1 - errorRate) * utilization
```

**リソース配分式:**
```
Allocation(a_i, t) = baseSlots * priority(a_i) * (1 + performanceBonus)
```

**実装:** `.pi/lib/performance-monitor.ts`

**主なクラス/メソッド:**
- `PerformanceMonitor` - パフォーマンスモニタークラス
- `record()` - メトリクス記録
- `getCurrentScore()` - 現在のパフォーマンススコア取得
- `getResourceAllocation()` - リソース配分計算

## Usage

### 統合DAG実行（推奨）

```typescript
import { DagExecutor, executeDag } from "./lib/dag-executor.js";

// DynTaskMAS統合実行（重みベーススケジューリング有効）
const result = await executeDag(plan, executor, {
  maxConcurrency: 4,
  useWeightBasedScheduling: true,  // DynTaskMAS有効化
  weightConfig: { alpha: 0.6, beta: 0.4 },
});

// 結果
console.log("Status:", result.overallStatus);
console.log("Duration:", result.totalDurationMs);
```

### 個別コンポーネント使用

### 重み計算

```typescript
import {
  calculateEdgeWeight,
  calculateTaskPriority,
  calculateComplexity,
} from "./lib/dag-weight-calculator.js";

// タスク複雑性を計算
const complexity = calculateComplexity(targetTask);

// エッジ重みを計算
const weight = calculateEdgeWeight(sourceTask, targetTask);

// タスク優先度を計算
const priority = calculateTaskPriority(task, criticalPathLength);
```

### 優先度スケジューリング

```typescript
import { PriorityScheduler } from "./lib/priority-scheduler.js";

const scheduler = new PriorityScheduler({
  maxConcurrency: 4,
  starvationPreventionInterval: 30000,
});

// タスクをスケジュール
const weights = new Map([["task-1", 10], ["task-2", 5]]);
const scheduled = scheduler.scheduleTasks(readyTasks, weights);

// 完了を記録
scheduler.markCompleted("task-1");
```

### コンテキスト管理

```typescript
import { ContextRepository, RELEVANCE_THRESHOLD } from "./lib/context-repository.js";

const repo = new ContextRepository();

// コンテキストを追加
repo.addContext("task-1", "調査結果...");
repo.addContext("task-2", "実装内容...", "task-1");

// 埋め込みを設定
repo.setEmbedding("task-1", embeddingVector);

// 関連コンテキストを取得
const relevant = repo.getRelevantContext(queryEmbedding, RELEVANCE_THRESHOLD);

// コンテキストを圧縮
const compressed = await repo.compressContext(node, 1000);
```

### パフォーマンス監視

```typescript
import { PerformanceMonitor } from "./lib/performance-monitor.js";

const monitor = new PerformanceMonitor();

// メトリクスを記録
monitor.record({
  activeAgents: 4,
  completedTasks: 10,
  failedTasks: 1,
  avgLatencyMs: 250,
});

// パフォーマンススコアを取得
const score = monitor.getCurrentScore();

// リソース配分を計算
const agents = [
  { id: "implementer", priority: 1.0 },
  { id: "reviewer", priority: 0.7 },
];
const allocations = monitor.getResourceAllocation(agents, 16);
```

## Integration Example

```typescript
import { calculateTotalTaskWeight } from "./lib/dag-weight-calculator.js";
import { PriorityScheduler } from "./lib/priority-scheduler.js";
import { ContextRepository } from "./lib/context-repository.js";
import { PerformanceMonitor } from "./lib/performance-monitor.js";

// 初期化
const scheduler = new PriorityScheduler({ maxConcurrency: 4 });
const contextRepo = new ContextRepository();
const perfMonitor = new PerformanceMonitor();

// タスクの重みを計算
const weights = new Map<string, number>();
for (const task of tasks) {
  weights.set(task.id, calculateTotalTaskWeight(task, taskMap));
}

// スケジュール実行
const scheduled = scheduler.scheduleTasks(readyTasks, weights);

// コンテキスト管理
for (const task of completedTasks) {
  contextRepo.addContext(task.id, task.output, task.parentId);
}

// パフォーマンス記録
perfMonitor.record({
  activeAgents: activeCount,
  completedTasks: completedCount,
  pendingTasks: pendingCount,
});
```

## Expected Improvements

| Metric | Baseline | Target | Paper Result |
|--------|----------|--------|--------------|
| Execution Time | 100% | 67-79% | 21-33% reduction |
| Resource Utilization | 65% | 88% | +35.4% |
| Scaling (16 agents) | - | 3.47x | Near-linear |

## Configuration

### WeightConfig

```typescript
interface WeightConfig {
  alpha: number; // 複雑性係数 (default: 0.6)
  beta: number;  // 依存性係数 (default: 0.4)
}
```

### SchedulerConfig

```typescript
interface SchedulerConfig {
  maxConcurrency: number;                    // 最大並列数 (default: 4)
  starvationPreventionInterval: number;      // スタベーション防止間隔ms (default: 30000)
}
```

### MonitorConfig

```typescript
interface MonitorConfig {
  windowSize: number;  // メトリクス保持数 (default: 100)
  maxAgents: number;   // 最大エージェント数 (default: 16)
}
```

## Related Skills

- `task-planner` - タスク分解とDAG構築
- `clean-architecture` - アーキテクチャ設計原則
- `agent-estimation` - エージェント工数見積もり

## References

- DynTaskMAS Paper: "Dynamic Task Assignment for Multi-Agent Systems"
- LLMCompiler: "An LLM Compiler for Parallel Function Calling"
- RepoGraph: "Code Localization via Dependency Graphs"
