---
title: cost-estimator.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [cost, estimation, scheduling, historical-learning]
related: [task-scheduler.ts, subagents.ts, agent-teams.ts]
---

# cost-estimator.ts

履史学習サポート付きタスクスケジューリング用コスト推定。

## 概要

推定実行時間とトークン消費量に基づいてスケジューリング決定を可能にする。デフォルト推定と履歴ベースの学習をサポートする。将来のMLベースヒューリスティック拡張用に設計されている。

## 型定義

### CostEstimationMethod

```typescript
type CostEstimationMethod = "default" | "historical" | "heuristic"
```

コスト計算に使用される推定手法。

### CostEstimation

```typescript
interface CostEstimation {
  estimatedDurationMs: number;
  estimatedTokens: number;
  confidence: number;
  method: CostEstimationMethod;
}
```

詳細コスト推定結果。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `estimatedDurationMs` | `number` | 推定実行時間（ミリ秒） |
| `estimatedTokens` | `number` | 推定トークン消費量 |
| `confidence` | `number` | 推定の信頼度（0.0 - 1.0） |
| `method` | `CostEstimationMethod` | 推定に使用した手法 |

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

履史学習用の完了実行記録。

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

特定ソース種別の統計情報。

### CostEstimatorConfig

```typescript
interface CostEstimatorConfig {
  minHistoricalExecutions: number;
  maxHistoryPerSource: number;
  historicalWeight: number;
}
```

コスト推定器の設定。

## 定数

### DEFAULT_CONFIG

```typescript
const DEFAULT_CONFIG: CostEstimatorConfig = {
  minHistoricalExecutions: 5,
  maxHistoryPerSource: 100,
  historicalWeight: 0.7,
}
```

### DEFAULT_ESTIMATES

ソース種別別のデフォルトコスト推定。

| ソース | 実行時間 | トークン |
|--------|----------|----------|
| `subagent_run` | 30,000ms | 4,000 |
| `subagent_run_parallel` | 45,000ms | 8,000 |
| `agent_team_run` | 60,000ms | 12,000 |
| `agent_team_run_parallel` | 90,000ms | 24,000 |

## クラス

### CostEstimator

デフォルト推定と履史学習をサポートするコスト推定器。

#### コンストラクタ

```typescript
constructor(config?: Partial<CostEstimatorConfig>)
```

#### メソッド

##### estimate

タスクのコストを推定する。

```typescript
estimate(
  source: TaskSource,
  provider?: string,
  model?: string,
  taskDescription?: string
): CostEstimation
```

履歴データが不十分な場合はデフォルト推定にフォールバックする。

##### recordExecution

履史学習用に完了実行を記録する。

```typescript
recordExecution(entry: ExecutionHistoryEntry): void
```

スレッドセーフ: 不変配列置換を使用。

##### getStats

ソース種別の統計情報を取得する。

```typescript
getStats(source: TaskSource): SourceStatistics | undefined
```

履歴がない場合は`undefined`を返す。

##### clear

全履歴とキャッシュをクリアする。

```typescript
clear(): void
```

##### getDefaultEstimate (static)

ソース種別のデフォルト推定を取得する。

```typescript
static getDefaultEstimate(source: TaskSource): { durationMs: number; tokens: number }
```

## 関数

### getCostEstimator

シングルトンコスト推定器インスタンスを取得する。

```typescript
function getCostEstimator(): CostEstimator
```

### createCostEstimator

カスタム設定で新しいコスト推定器を作成する。

```typescript
function createCostEstimator(config?: Partial<CostEstimatorConfig>): CostEstimator
```

### resetCostEstimator

シングルトン推定器をリセットする（テスト用）。

```typescript
function resetCostEstimator(): void
```

## 使用例

```typescript
import {
  getCostEstimator,
  createCostEstimator,
  CostEstimator,
} from "./lib/cost-estimator.js";

// シングルトン使用
const estimator = getCostEstimator();

// コスト推定
const estimation = estimator.estimate(
  "subagent_run",
  "anthropic",
  "claude-sonnet-4",
  "ファイルを分析する"
);

console.log(`Estimated duration: ${estimation.estimatedDurationMs}ms`);
console.log(`Estimated tokens: ${estimation.estimatedTokens}`);
console.log(`Confidence: ${estimation.confidence}`);
console.log(`Method: ${estimation.method}`);

// 実行記録
estimator.recordExecution({
  source: "subagent_run",
  provider: "anthropic",
  model: "claude-sonnet-4",
  taskDescription: "ファイルを分析する",
  actualDurationMs: 25000,
  actualTokens: 3500,
  success: true,
  timestamp: Date.now(),
});

// 統計取得
const stats = estimator.getStats("subagent_run");
if (stats) {
  console.log(`Average duration: ${stats.avgDurationMs}ms`);
  console.log(`Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
}

// デフォルト推定
const defaults = CostEstimator.getDefaultEstimate("agent_team_run");
console.log(`Default: ${defaults.durationMs}ms, ${defaults.tokens} tokens`);

// カスタム設定
const customEstimator = createCostEstimator({
  minHistoricalExecutions: 3,
  maxHistoryPerSource: 50,
});
```

## アルゴリズム

1. 履歴データがある場合:
   - 統計情報を計算（平均時間、平均トークン）
   - 信頼度 = 0.5 + (実行回数 / 最大履歴数) * 0.4
   - 手法 = "historical"

2. 履歴データがない場合:
   - デフォルト推定を使用
   - 信頼度 = 0.5
   - 手法 = "default"

## 関連ファイル

- `.pi/lib/task-scheduler.ts` - タスクスケジューラ
- `.pi/extensions/subagents.ts` - サブエージェント実行
- `.pi/extensions/agent-teams.ts` - エージェントチーム実行
