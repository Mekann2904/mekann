---
title: context-usage-dashboard
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, context, monitoring, dashboard]
related: [usage-tracker, extensions]
---

# context-usage-dashboard

> パンくず: [Home](../../README.md) > [Extensions](./) > context-usage-dashboard

## 概要

現在のコンテキスト使用量と直近7日間の使用量・内訳を表示する拡張機能。ツールごとの占有傾向と空き容量を可視化し、拡張機能の取捨選択を助ける。

## 型定義

### CurrentSnapshot

現在のコンテキストスナップショットを表すインターフェース。

```typescript
interface CurrentSnapshot {
  usage: ContextUsage | undefined;
  freeTokens: number | null;
  referenceTotalTokens: number;
  categoryTokens: {
    user: number;
    assistant: number;
    tools: number;
    other: number;
  };
  toolTokens: Map<string, number>;
  toolCalls: Map<string, number>;
}
```

### ToolStats

ツール統計情報を表すインターフェース。

```typescript
interface ToolStats {
  calls: number;
  contextTokens: number;
  usageTokens: number;
}
```

### WeeklySnapshot

週間スナップショットを表すインターフェース。

```typescript
interface WeeklySnapshot {
  startMs: number;
  endMs: number;
  files: number;
  totalUsageTokens: number;
  usageBreakdown: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  totalCost: number;
  models: Map<string, number>;
  tools: Map<string, ToolStats>;
}
```

### DashboardSnapshot

ダッシュボードスナップショットを表すインターフェース。

```typescript
interface DashboardSnapshot {
  scopeLabel: string;
  current: CurrentSnapshot;
  week: WeeklySnapshot;
}
```

## 主な関数

### collectCurrentSnapshot

現在のコンテキストスナップショットを収集する。

```typescript
function collectCurrentSnapshot(ctx: ExtensionAPI["context"]): CurrentSnapshot
```

**パラメータ**:
- `ctx`: ExtensionAPIのコンテキスト

**戻り値**: CurrentSnapshotオブジェクト

### collectWeeklySnapshot

週間スナップショットを収集する。

```typescript
function collectWeeklySnapshot(scopeDir: string | undefined): WeeklySnapshot
```

**パラメータ**:
- `scopeDir`: スコープディレクトリパス（省略時は全ワークスペース）

**戻り値**: WeeklySnapshotオブジェクト

### collectDashboardSnapshot

ダッシュボードスナップショットを収集する。

```typescript
function collectDashboardSnapshot(ctx: ExtensionAPI["context"]): DashboardSnapshot
```

**パラメータ**:
- `ctx`: ExtensionAPIのコンテキスト

**戻り値**: DashboardSnapshotオブジェクト

### estimateMessageTokens

メッセージのトークン数を推定する。

```typescript
function estimateMessageTokens(message: any): number
```

**パラメータ**:
- `message`: メッセージオブジェクト

**戻り値**: 推定トークン数

### renderDashboard

ダッシュボードをレンダリングする。

```typescript
function renderDashboard(theme: any, snapshot: DashboardSnapshot, width: number): string[]
```

**パラメータ**:
- `theme`: テーマオブジェクト
- `snapshot`: ダッシュボードスナップショット
- `width`: 表示幅

**戻り値**: レンダリングされた行の配列

## ユーティリティ関数

### addToMap

Mapに値を加算する。

```typescript
function addToMap(map: Map<string, number>, key: string, value: number): void
```

### formatTokens

トークン数をフォーマットする。

```typescript
function formatTokens(value: number): string
```

### formatPercent

パーセントをフォーマットする。

```typescript
function formatPercent(value: number): string
```

### formatCost

コストをフォーマットする。

```typescript
function formatCost(value: number): string
```

## コマンド

### /context-usage

現在のコンテキスト使用量と週間の内訳をツール/モデル別に表示する。

**説明**: 現在のコンテキスト使用量と週間の内訳をツール/モデル別に表示

**操作**:
- `[r]`: リフレッシュ
- `[q]`: 閉じる

## 定数

| 名前 | 値 | 説明 |
|------|------|------|
| `SESSIONS_ROOT` | `~/.pi/agent/sessions` | セッションルートディレクトリ |
| `WEEK_MS` | `7 * 24 * 60 * 60 * 1000` | 1週間のミリ秒 |
| `TOP_ROWS` | `8` | 表示する最大行数 |

## 表示内容

### Current Contextセクション

- 使用トークン数 / コンテキストウィンドウサイズ
- 空きトークン数
- 使用量・末尾トークン数
- カテゴリ別推定占有率（user, assistant, tools, other）

### Current Tool Occupancyセクション

現在のブランチ内のツールResultメッセージによる推定占有率。

### Last 7 Daysセクション

- 使用トークン数
- input/output内訳
- cacheRead/cacheWrite内訳
- コスト

### Weekly Model Breakdownセクション

モデル別の使用トークン数とシェア。

### Weekly Tool Breakdownセクション

ツール別のコール数、コンテキスト推定、使用量推定。

## 依存関係

- `@mariozechner/pi-coding-agent`: ExtensionAPI, ContextUsage型
- `@mariozechner/pi-tui`: truncateToWidth関数
- `../lib/validation-utils.js`: toFiniteNumberWithDefault関数

---

## 関連トピック

- [usage-tracker](usage-tracker.md) - 使用量追跡拡張機能
- [extensions](../../docs/extensions.md) - 拡張機能一覧
