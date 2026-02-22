---
title: cost-estimator
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# cost-estimator

## 概要

`cost-estimator` モジュールのAPIリファレンス。

## インポート

```typescript
// from './task-scheduler': TaskSource
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getCostEstimator` | - |
| 関数 | `createCostEstimator` | コスト推定器を作成 |
| 関数 | `resetCostEstimator` | - |
| クラス | `CostEstimator` | コスト推定器 |
| インターフェース | `CostEstimation` | コストの推定結果 |
| インターフェース | `ExecutionHistoryEntry` | 実行履歴のエントリ |
| インターフェース | `SourceStatistics` | ソースの統計情報 |
| インターフェース | `CostEstimatorConfig` | 設定定義 |
| 型 | `CostEstimationMethod` | コスト計算の推定方法 |

## 図解

### クラス図

```mermaid
classDiagram
  class CostEstimator {
    -config: CostEstimatorConfig
    -history: Map_TaskSource_Execu
    -statsCache: Map_TaskSource_Sourc
    +estimate()
    +recordExecution()
    +getStats()
    +clear()
    +getDefaultEstimate()
  }
  class CostEstimation {
    <<interface>>
    +estimatedDurationMs: number
    +estimatedTokens: number
    +confidence: number
    +method: CostEstimationMethod
  }
  class ExecutionHistoryEntry {
    <<interface>>
    +source: TaskSource
    +provider: string
    +model: string
    +taskDescription: string
    +actualDurationMs: number
  }
  class SourceStatistics {
    <<interface>>
    +executionCount: number
    +avgDurationMs: number
    +avgTokens: number
    +minDurationMs: number
    +maxDurationMs: number
  }
  class CostEstimatorConfig {
    <<interface>>
    +minHistoricalExecutions: number
    +maxHistoryPerSource: number
    +historicalWeight: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[cost-estimator]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    task_scheduler["task-scheduler"]
  end
  main --> local
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant cost_estimator as "cost-estimator"
  participant task_scheduler as "task-scheduler"

  Caller->>cost_estimator: getCostEstimator()
  cost_estimator->>task_scheduler: 内部関数呼び出し
  task_scheduler-->>cost_estimator: 結果
  cost_estimator-->>Caller: CostEstimator

  Caller->>cost_estimator: createCostEstimator()
  cost_estimator-->>Caller: CostEstimator
```

## 関数

### getCostEstimator

```typescript
getCostEstimator(): CostEstimator
```

**戻り値**: `CostEstimator`

### createCostEstimator

```typescript
createCostEstimator(config?: Partial<CostEstimatorConfig>): CostEstimator
```

コスト推定器を作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| config | `Partial<CostEstimatorConfig>` | いいえ |

**戻り値**: `CostEstimator`

### resetCostEstimator

```typescript
resetCostEstimator(): void
```

**戻り値**: `void`

## クラス

### CostEstimator

コスト推定器

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| config | `CostEstimatorConfig` | private |
| history | `Map<TaskSource, ExecutionHistoryEntry[]>` | private |
| statsCache | `Map<TaskSource, SourceStatistics>` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| estimate | `estimate(source, provider, model, taskDescription): CostEstimation` |
| recordExecution | `recordExecution(entry): void` |
| getStats | `getStats(source): SourceStatistics | undefined` |
| clear | `clear(): void` |
| getDefaultEstimate | `getDefaultEstimate(source): { durationMs: number; tokens: number }` |

## インターフェース

### CostEstimation

```typescript
interface CostEstimation {
  estimatedDurationMs: number;
  estimatedTokens: number;
  confidence: number;
  method: CostEstimationMethod;
}
```

コストの推定結果

### ExecutionHistoryEntry

```typescript
interface ExecutionHistoryEntry {
  source: TaskSource;
  provider: string;
  model: string;
  taskDescription?: string;
  actualDurationMs: number;
  actualTokens: number;
  success: boolean;
  timestamp: number;
}
```

実行履歴のエントリ

### SourceStatistics

```typescript
interface SourceStatistics {
  executionCount: number;
  avgDurationMs: number;
  avgTokens: number;
  minDurationMs: number;
  maxDurationMs: number;
  successRate: number;
  lastUpdated: number;
}
```

ソースの統計情報

### CostEstimatorConfig

```typescript
interface CostEstimatorConfig {
  minHistoricalExecutions: number;
  maxHistoryPerSource: number;
  historicalWeight: number;
}
```

設定定義

## 型定義

### CostEstimationMethod

```typescript
type CostEstimationMethod = "default" | "historical" | "heuristic"
```

コスト計算の推定方法

---
*自動生成: 2026-02-22T19:27:00.583Z*
