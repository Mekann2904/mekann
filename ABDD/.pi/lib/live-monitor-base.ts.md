---
title: Live Monitor Base
category: reference
audience: developer
last_updated: 2026-02-18
tags: [live, monitor, tui, stream]
related: [live-view-utils, tui-utils]
---

# Live Monitor Base

ライブモニタリングビュー（サブエージェント、エージェントチーム等）の共通パターンを提供するジェネリックモジュール。

## 概要

類似したライブモニター実装間のDRY違反を解消する。ストリームデータ管理、レンダリング、入力ハンドリングの共通機能を提供。

## 型定義

### LiveItemStatus

ライブアイテムのステータス。

```typescript
type LiveItemStatus = "pending" | "running" | "completed" | "failed";
```

### LiveStreamView

ライブストリームビューオプション。

```typescript
type LiveStreamView = "stdout" | "stderr";
```

### LiveViewMode

ライブビューモードオプション。

```typescript
type LiveViewMode = "list" | "detail";
```

### BaseLiveItem

ストリームデータを持つライブモニターアイテムの基本インターフェース。

```typescript
interface BaseLiveItem {
  id: string;
  status: LiveItemStatus;
  startedAtMs?: number;
  finishedAtMs?: number;
  lastChunkAtMs?: number;
  summary?: string;
  error?: string;
  stdoutTail: string;
  stderrTail: string;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutNewlineCount: number;
  stderrNewlineCount: number;
  stdoutEndsWithNewline: boolean;
  stderrEndsWithNewline: boolean;
}
```

### BaseLiveMonitorController

ライブモニターコントローラの基本インターフェース。

```typescript
interface BaseLiveMonitorController {
  markStarted: (id: string) => void;
  appendChunk: (id: string, stream: LiveStreamView, chunk: string) => void;
  markFinished: (id: string, status: "completed" | "failed", summary: string, error?: string) => void;
  close: () => void;
  wait: () => Promise<void>;
}
```

### CreateLiveItemInput

ライブアイテム作成の入力。

```typescript
interface CreateLiveItemInput {
  id: string;
  name?: string;
}
```

### LiveMonitorFactoryOptions

ライブモニターファクトリのオプション。

```typescript
interface LiveMonitorFactoryOptions<TItem extends BaseLiveItem> {
  createItem: (input: CreateLiveItemInput) => TItem;
  onStarted?: (item: TItem) => void;
  onChunk?: (item: TItem, stream: LiveStreamView, chunk: string) => void;
  onFinished?: (item: TItem, status: "completed" | "failed", summary: string, error?: string) => void;
}
```

### LiveViewHeaderData

ライブビュー用の共通ヘッダーデータ。

```typescript
interface LiveViewHeaderData {
  title: string;
  mode: LiveViewMode;
  running: number;
  completed: number;
  failed: number;
  total: number;
}
```

### HandleInputResult

入力処理の結果。

```typescript
interface HandleInputResult {
  handled: boolean;
  action?: "close" | "mode-list" | "mode-detail" | "stream-toggle";
  cursorDelta?: number;
  cursorAbsolute?: number;
}
```

## 定数

```typescript
const LIVE_PREVIEW_LINE_LIMIT = 36;
const LIVE_LIST_WINDOW_SIZE = 20;
```

## ファクトリ関数

### createBaseLiveItem(input)

デフォルト値を持つベースライブアイテムを作成する。

```typescript
function createBaseLiveItem(input: CreateLiveItemInput): BaseLiveItem
```

## ストリームユーティリティ

### appendStreamChunk(item, stream, chunk)

チャンクを適切なストリームテールに追加する。

```typescript
function appendStreamChunk(
  item: BaseLiveItem,
  stream: LiveStreamView,
  chunk: string
): void
```

### getStreamTail(item, stream, autoSwitchOnFailure)

ビューモードとストリームに基づいて適切なストリームテールを取得する。失敗アイテムでstdoutがない場合、自動的にstderrに切り替える。

```typescript
function getStreamTail(
  item: BaseLiveItem,
  stream: LiveStreamView,
  autoSwitchOnFailure?: boolean
): string
```

### getStreamBytes(item, stream)

ストリームバイト数を取得する。

```typescript
function getStreamBytes(item: BaseLiveItem, stream: LiveStreamView): number
```

### getStreamLineCount(item, stream)

推定ストリーム行数を取得する。

```typescript
function getStreamLineCount(item: BaseLiveItem, stream: LiveStreamView): number
```

## レンダリングユーティリティ

### renderLiveViewHeader(data, width, theme)

ライブビュー用の共通ヘッダーラインをレンダリングする。

```typescript
function renderLiveViewHeader(
  data: LiveViewHeaderData,
  width: number,
  theme: any
): string[]
```

### renderListKeyboardHints(width, theme)

リストアイテムのキーボードヒントをレンダリングする。

```typescript
function renderListKeyboardHints(width: number, theme: any): string[]
```

### renderDetailKeyboardHints(width, theme, extraKeys)

詳細アイテムのキーボードヒントをレンダリングする。

```typescript
function renderDetailKeyboardHints(
  width: number,
  theme: any,
  extraKeys?: string
): string[]
```

### renderListWindow(items, cursor, windowSize, renderItem, width, theme)

ページネーション付きでリストウィンドウをレンダリングする。

```typescript
function renderListWindow<T>(
  items: T[],
  cursor: number,
  windowSize: number,
  renderItem: (item: T, index: number, isSelected: boolean) => string,
  width: number,
  theme: any
): string[]
```

### renderBaseListItemLine(item, index, isSelected, width, theme, extraMeta)

単一のリストアイテムライン（ベースフォーマット）をレンダリングする。

```typescript
function renderBaseListItemLine(
  item: BaseLiveItem & { name?: string },
  index: number,
  isSelected: boolean,
  width: number,
  theme: any,
  extraMeta?: string
): string
```

### renderSelectedItemSummary(items, cursor, ...)

選択されたアイテムのサマリーをレンダリングする。

```typescript
function renderSelectedItemSummary<T>(
  items: T[],
  cursor: number,
  getItemId: (item: T) => string,
  getItemName: (item: T) => string | undefined,
  getItemStatus: (item: T) => LiveItemStatus,
  getItemElapsed: (item: T) => string,
  width: number,
  theme: any,
  extraInfo?: (item: T) => string | undefined
): string[]
```

### renderDetailHeader(item, cursor, total, ...)

選択されたアイテムの詳細ヘッダーをレンダリングする。

```typescript
function renderDetailHeader<T>(
  item: T,
  cursor: number,
  total: number,
  getItemId: (item: T) => string,
  getItemName: (item: T) => string | undefined,
  width: number,
  theme: any
): string[]
```

### renderStreamOutput(item, stream, width, height, currentLines, theme, itemId)

ストリーム出力セクションをレンダリングする。

```typescript
function renderStreamOutput(
  item: BaseLiveItem,
  stream: LiveStreamView,
  width: number,
  height: number,
  currentLines: number,
  theme: any,
  itemId: string
): string[]
```

## 入力ハンドリング

### handleListModeInput(rawInput)

リストモード用の共通キーボード入力を処理する。

```typescript
function handleListModeInput(rawInput: string): HandleInputResult
```

**キーバインド:**
| キー | アクション |
|-----|----------|
| q / Esc | close |
| j / Down | cursorDelta: 1 |
| k / Up | cursorDelta: -1 |
| g | cursorAbsolute: 0 |
| G | cursorAbsolute: -1 (最後) |
| Enter | mode-detail |
| Tab | stream-toggle |

### handleDetailModeInput(rawInput)

詳細モード用の共通キーボード入力を処理する。

```typescript
function handleDetailModeInput(rawInput: string): HandleInputResult
```

**キーバインド:**
| キー | アクション |
|-----|----------|
| q | close |
| Esc / b / B | mode-list |
| j / Down | cursorDelta: 1 |
| k / Up | cursorDelta: -1 |
| g | cursorAbsolute: 0 |
| G | cursorAbsolute: -1 |
| Tab | stream-toggle |

### applyInputResult(result, state)

入力結果を状態に適用する。

```typescript
function applyInputResult(
  result: HandleInputResult,
  state: {
    cursor: number;
    itemCount: number;
    mode: LiveViewMode;
    stream: LiveStreamView;
  }
): {
  cursor: number;
  mode: LiveViewMode;
  stream: LiveStreamView;
  shouldClose: boolean;
  shouldRender: boolean;
}
```

## 使用例

```typescript
import {
  createBaseLiveItem,
  appendStreamChunk,
  renderLiveViewHeader,
  handleListModeInput,
  applyInputResult
} from "./live-monitor-base.js";

// アイテム作成
const item = createBaseLiveItem({ id: "task-1", name: "Build" });
item.status = "running";

// チャンク追加
appendStreamChunk(item, "stdout", "Building...\n");

// ヘッダーレンダリング
const headerLines = renderLiveViewHeader({
  title: "Subagents",
  mode: "list",
  running: 1,
  completed: 0,
  failed: 0,
  total: 1
}, 80, theme);

// 入力処理
const result = handleListModeInput("j");
const newState = applyInputResult(result, { cursor: 0, itemCount: 5, mode: "list", stream: "stdout" });
```

## 関連ファイル

- `./live-view-utils.ts` - ライブビューユーティリティ
- `./tui-utils.ts` - TUIユーティリティ
- `./format-utils.ts` - フォーマットユーティリティ
