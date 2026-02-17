---
title: agent-usage-tracker
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated, extensions]
---

# agent-usage-tracker

## 概要

拡張機能ごとの機能使用量、ツールエラー、平均コンテキスト占有率を追跡し、エージェント活動の詳細な分析ビューを提供する。

## エクスポート

### インターフェース

#### UsageTrackerState

```typescript
interface UsageTrackerState {
  version: number;
  createdAt: string;
  updatedAt: string;
  totals: {
    toolCalls: number;
    toolErrors: number;
    agentRuns: number;
    agentRunErrors: number;
    contextSamples: number;
    contextRatioSum: number;
    contextTokenSamples: number;
    contextTokenSum: number;
  };
  features: Record<string, FeatureMetrics>;
  events: UsageEventRecord[];
}
```

使用量追跡の状態。

#### FeatureMetrics

```typescript
interface FeatureMetrics {
  extension: string;
  featureType: FeatureType;
  featureName: string;
  calls: number;
  errors: number;
  contextSamples: number;
  contextRatioSum: number;
  contextTokenSamples: number;
  contextTokenSum: number;
  lastUsedAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
}
```

機能ごとのメトリクス。

#### UsageEventRecord

```typescript
interface UsageEventRecord {
  id: string;
  timestamp: string;
  extension: string;
  featureType: FeatureType;
  featureName: string;
  status: EventStatus;
  durationMs?: number;
  toolCallId?: string;
  inputPreview?: string;
  contextRatio?: number;
  contextTokens?: number;
  contextWindow?: number;
  error?: string;
}
```

使用イベントレコード。

#### FeatureCatalog

```typescript
interface FeatureCatalog {
  discoveredAt: string;
  toolToExtension: Record<string, string>;
  commandToExtension: Record<string, string>;
}
```

検出された機能カタログ。

### 型エイリアス

#### FeatureType

```typescript
type FeatureType = "tool" | "agent_run"
```

#### EventStatus

```typescript
type EventStatus = "ok" | "error"
```

## 登録ツール

### agent_usage_stats

拡張機能の使用統計を読み取り/リセット/エクスポートする。

```typescript
parameters: {
  action?: "summary" | "recent" | "reset" | "export";
  limit?: number;
  exportPath?: string;
}
```

## 登録コマンド

### /agent-usage

拡張機能の機能使用量、エラー率、平均コンテキスト占有率を表示。

```
/agent-usage                # サマリー
/agent-usage recent [n]     # 最近のログ
/agent-usage reset          # 統計リセット
/agent-usage export [path]  # JSONスナップショット書き出し
```

## 使用例

```typescript
// ツールとして使用
agent_usage_stats({ action: "summary" })
agent_usage_stats({ action: "recent", limit: 50 })
agent_usage_stats({ action: "reset" })
agent_usage_stats({ action: "export", exportPath: "./stats.json" })

// コマンドとして使用
/agent-usage
/agent-usage recent 30
```

## 追跡メトリクス

### ツール呼び出し

- 呼び出し回数
- エラー回数
- エラー率

### エージェント実行

- 実行回数
- エラー回数

### コンテキスト使用量

- コンテキスト占有率（比率）
- 平均トークン数

## イベント追跡

以下のイベントを自動追跡:
- `tool_call`: ツール呼び出し開始
- `tool_result`: ツール完了
- `agent_start`: エージェント開始
- `agent_end`: エージェント終了
- `session_start`: セッション開始
- `session_shutdown`: セッション終了

## データ保存

- 保存先: `.pi/analytics/agent-usage-stats.json`
- 最大イベント履歴: 5000件

## 機能検出

拡張機能ディレクトリ（`.pi/extensions/`）をスキャンし、登録されたツールとコマンドを自動検出する。

## 出力例

```
Agent Usage Tracker
Updated: 2026-02-18T01:00:00.000Z

Tool calls: 1234
Tool errors: 12 (1.0%)
Agent runs: 56
Agent run errors: 2 (3.6%)
Average context occupancy: 45.2% (100 samples)

By extension:
- subagents: calls=500, errors=5 (1.0%), avg_ctx=42.1%
- agent-teams: calls=300, errors=3 (1.0%), avg_ctx=48.5%
- core: calls=434, errors=4 (0.9%), avg_ctx=45.0%
```

## 関連

- `.pi/extensions/subagents.ts`
- `.pi/extensions/agent-teams.ts`
- `.pi/extensions/usage-tracker.ts`
