---
title: metrics
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# metrics

## 概要

`metrics` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `aggregateMetrics` | メトリクスを集計してサマリーを生成する |
| 関数 | `formatMetrics` | 検索メトリクスを表示用にフォーマットする |
| 関数 | `formatDuration` | ミリ秒を読みやすい時間文字列に変換 |
| 関数 | `classifySpeed` | 実行時間に基づいて速度を分類する |
| クラス | `MetricsCollector` | 操作の時間計測用メトリクスコレクタ |
| インターフェース | `SearchMetrics` | 検索操作のパフォーマンス指標。 |
| インターフェース | `ExtendedSearchMetrics` | 拡張検索メトリクス |
| インターフェース | `AggregatedMetrics` | 複数操作の集計メトリクス |
| インターフェース | `ToolMetricsSummary` | 単一ツールのメトリクス概要 |
| インターフェース | `PerformanceThresholds` | 検索操作のパフォーマンスしきい値 |

## 図解

### クラス図

```mermaid
classDiagram
  class MetricsCollector {
    -startTime: number
    -toolName: string
    -filesSearched: any
    -indexHitRate: number_undefined
    +setFilesSearched()
    +setIndexHitRate()
    +elapsedMs()
    +finish()
  }
  class SearchMetrics {
    <<interface>>
    +durationMs: number
    +filesSearched: number
    +indexHitRate: number
    +toolName: string
  }
  class ExtendedSearchMetrics {
    <<interface>>
    +cliTimeMs: number
    +parseTimeMs: number
    +totalResults: number
    +returnedResults: number
    +truncated: boolean
  }
  class AggregatedMetrics {
    <<interface>>
    +operationCount: number
    +totalDurationMs: number
    +averageDurationMs: number
    +minDurationMs: number
    +maxDurationMs: number
  }
  class ToolMetricsSummary {
    <<interface>>
    +count: number
    +totalDurationMs: number
    +averageDurationMs: number
  }
  class PerformanceThresholds {
    <<interface>>
    +fast: number
    +normal: number
    +slow: number
  }
```

### 関数フロー

```mermaid
flowchart TD
  aggregateMetrics["aggregateMetrics()"]
  formatMetrics["formatMetrics()"]
  formatDuration["formatDuration()"]
  classifySpeed["classifySpeed()"]
  aggregateMetrics -.-> formatMetrics
  formatMetrics -.-> formatDuration
  formatDuration -.-> classifySpeed
```

## 関数

### aggregateMetrics

```typescript
aggregateMetrics(metrics: SearchMetrics[]): AggregatedMetrics
```

メトリクスを集計してサマリーを生成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| metrics | `SearchMetrics[]` | はい |

**戻り値**: `AggregatedMetrics`

### formatMetrics

```typescript
formatMetrics(metrics: SearchMetrics): string
```

検索メトリクスを表示用にフォーマットする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| metrics | `SearchMetrics` | はい |

**戻り値**: `string`

### formatDuration

```typescript
formatDuration(ms: number): string
```

ミリ秒を読みやすい時間文字列に変換

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ms | `number` | はい |

**戻り値**: `string`

### classifySpeed

```typescript
classifySpeed(durationMs: number, thresholds: PerformanceThresholds): "fast" | "normal" | "slow" | "very-slow"
```

実行時間に基づいて速度を分類する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| durationMs | `number` | はい |
| thresholds | `PerformanceThresholds` | はい |

**戻り値**: `"fast" | "normal" | "slow" | "very-slow"`

## クラス

### MetricsCollector

操作の時間計測用メトリクスコレクタ

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| startTime | `number` | private |
| toolName | `string` | private |
| filesSearched | `any` | private |
| indexHitRate | `number | undefined` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| setFilesSearched | `setFilesSearched(count): this` |
| setIndexHitRate | `setIndexHitRate(rate): this` |
| elapsedMs | `elapsedMs(): number` |
| finish | `finish(): SearchMetrics` |

## インターフェース

### SearchMetrics

```typescript
interface SearchMetrics {
  durationMs: number;
  filesSearched: number;
  indexHitRate?: number;
  toolName: string;
}
```

検索操作のパフォーマンス指標。

### ExtendedSearchMetrics

```typescript
interface ExtendedSearchMetrics {
  cliTimeMs?: number;
  parseTimeMs?: number;
  totalResults: number;
  returnedResults: number;
  truncated: boolean;
  usedFallback: boolean;
}
```

拡張検索メトリクス

### AggregatedMetrics

```typescript
interface AggregatedMetrics {
  operationCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  totalFilesSearched: number;
  averageIndexHitRate?: number;
  byTool: Record<string, ToolMetricsSummary>;
}
```

複数操作の集計メトリクス

### ToolMetricsSummary

```typescript
interface ToolMetricsSummary {
  count: number;
  totalDurationMs: number;
  averageDurationMs: number;
}
```

単一ツールのメトリクス概要

### PerformanceThresholds

```typescript
interface PerformanceThresholds {
  fast: number;
  normal: number;
  slow: number;
}
```

検索操作のパフォーマンスしきい値

---
*自動生成: 2026-02-18T06:37:19.712Z*
