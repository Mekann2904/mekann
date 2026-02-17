---
title: agent-utils.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [agent, utilities, run-id]
related: [agent-types.ts, agent-common.ts]
---

# agent-utils.ts

共有エージェントユーティリティ関数。複数ファイルに分散していた実装を統合する。

## 概要

以下のファイルから重複する実装を統合:
- `.pi/extensions/loop.ts` (createRunId)
- `.pi/extensions/subagents.ts` (createRunId, computeLiveWindow)
- `.pi/extensions/agent-teams.ts` (createRunId, computeLiveWindow)

## 関数

### createRunId

タイムスタンプとランダムサフィックス付きの一意実行IDを作成する。

```typescript
function createRunId(): string
```

**戻り値**

形式: `YYYYMMDD-HHMMSS-xxxxxx`（xxxxxxは6桁の16進数）

**使用例**

```typescript
const runId = createRunId();
// 例: "20260218-013907-a1b2c3"
```

### computeLiveWindow

ライブリスト表示用のスライディングウィンドウを計算する。

```typescript
function computeLiveWindow(
  cursor: number,
  total: number,
  maxRows: number,
): { start: number; end: number }
```

**パラメータ**

| 名前 | 型 | 説明 |
|------|-----|------|
| `cursor` | `number` | 現在のカーソル位置（0始まり） |
| `total` | `number` | アイテム総数 |
| `maxRows` | `number` | 表示最大行数 |

**戻り値**

- `start`: 開始インデックス（含む）
- `end`: 終了インデックス（含まず）

**アルゴリズム**

可能な場合カーソルを中央に配置し、境界付近では調整する。

**使用例**

```typescript
// 20アイテム中、最大5行表示、カーソル位置10
const window = computeLiveWindow(10, 20, 5);
// { start: 8, end: 13 }

// カーソルが先頭付近の場合
const windowStart = computeLiveWindow(1, 20, 5);
// { start: 0, end: 5 }

// カーソルが末尾付近の場合
const windowEnd = computeLiveWindow(19, 20, 5);
// { start: 15, end: 20 }
```

## 使用例

```typescript
import { createRunId, computeLiveWindow } from "./lib/agent-utils.js";

// 実行ID生成
const runId = createRunId();
console.log(`Starting run: ${runId}`);

// ライブ表示ウィンドウ計算
const items = [...]; // 多数のアイテム
const cursor = 15;
const maxDisplayRows = 10;

const { start, end } = computeLiveWindow(cursor, items.length, maxDisplayRows);
const visibleItems = items.slice(start, end);
```

## 関連ファイル

- `.pi/lib/agent-types.ts` - エージェント型定義
- `.pi/lib/agent-common.ts` - エージェント共通ユーティリティ
- `.pi/extensions/loop.ts` - ループ実行
- `.pi/extensions/subagents.ts` - サブエージェント実行
- `.pi/extensions/agent-teams.ts` - エージェントチーム実行
