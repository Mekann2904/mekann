---
title: live-monitor-base
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# live-monitor-base

## 概要

`live-monitor-base` モジュールのAPIリファレンス。

## インポート

```typescript
import { matchesKey, Key, truncateToWidth } from '@mariozechner/pi-tui';
import { formatDurationMs, formatBytes, formatClockTime } from '../format-utils.js';
import { computeLiveWindow } from '../agent-utils.js';
import { getLiveStatusGlyph, isEnterInput, finalizeLiveLines } from '../live-view-utils.js';
import { appendTail, countOccurrences, estimateLineCount... } from './tui-utils.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `createBaseLiveItem` | デフォルト値を持つベースライブアイテムを作成する |
| 関数 | `appendStreamChunk` | 適切なストリームにチャンクを追加する |
| 関数 | `getStreamTail` | ビューモードとストリームに基づいて末尾を取得 |
| 関数 | `getStreamBytes` | ストリームのバイト数を取得 |
| 関数 | `getStreamLineCount` | Get estimated stream line count. |
| 関数 | `renderLiveViewHeader` | ライブビューの共通ヘッダーを描画する |
| 関数 | `renderListKeyboardHints` | キーボード操作のヒントを描画する |
| 関数 | `renderDetailKeyboardHints` | 詳細画面のキーボード操作ヒントを描画する |
| 関数 | `renderListWindow` | リストウィンドウをページネーション付きで描画する |
| 関数 | `renderBaseListItemLine` | 単一のリストアイテム行を描画する |
| 関数 | `renderSelectedItemSummary` | Render selected item summary. |
| 関数 | `renderDetailHeader` | 選択アイテムの詳細ヘッダーを描画する |
| 関数 | `renderStreamOutput` | ストリーム出力セクションを描画する |
| 関数 | `handleListModeInput` | リストモードでのキーボード入力を処理する。 |
| 関数 | `handleDetailModeInput` | Handle common keyboard input for detail mode. |
| 関数 | `applyInputResult` | 入力結果を状態に適用する |
| インターフェース | `BaseLiveItem` | ライブモニターのアイテムの基底インターフェース |
| インターフェース | `BaseLiveMonitorController` | ライブモニタコントローラの基底インターフェース |
| インターフェース | `CreateLiveItemInput` | ライブアイテム作成用の入力 |
| インターフェース | `LiveMonitorFactoryOptions` | Options for createLiveMonitorFactory. |
| インターフェース | `LiveViewHeaderData` | ライブビューの共通ヘッダーデータ |
| インターフェース | `HandleInputResult` | 入力処理の結果を表します。 |
| 型 | `LiveItemStatus` | ライブアイテムの状態。 |
| 型 | `LiveStreamView` | ライブストリームの表示オプション |
| 型 | `LiveViewMode` | ライブビューのモードオプション。 |

## 図解

### クラス図

```mermaid
classDiagram
  class BaseLiveItem {
    <<interface>>
    +id: string
    +status: LiveItemStatus
    +startedAtMs: number
    +finishedAtMs: number
    +lastChunkAtMs: number
  }
  class BaseLiveMonitorController {
    <<interface>>
    +markStarted: id_string_void
    +appendChunk: id_string_stream_Li
    +markFinished: id_string_status_c
    +close: void
    +wait: Promise_void
  }
  class CreateLiveItemInput {
    <<interface>>
    +id: string
    +name: string
  }
  class LiveMonitorFactoryOptions {
    <<interface>>
    +createItem: input_CreateLiveIte
    +onStarted: item_TItem_void
    +onChunk: item_TItem_stream_L
    +onFinished: item_TItem_status
  }
  class LiveViewHeaderData {
    <<interface>>
    +title: string
    +mode: LiveViewMode
    +running: number
    +completed: number
    +failed: number
  }
  class HandleInputResult {
    <<interface>>
    +handled: boolean
    +action: close_mode_list
    +cursorDelta: number
    +cursorAbsolute: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[live-monitor-base]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    format_utils["format-utils"]
    agent_utils["agent-utils"]
    live_view_utils["live-view-utils"]
    tui_utils["tui-utils"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  createBaseLiveItem["createBaseLiveItem()"]
  appendStreamChunk["appendStreamChunk()"]
  getStreamTail["getStreamTail()"]
  getStreamBytes["getStreamBytes()"]
  getStreamLineCount["getStreamLineCount()"]
  renderLiveViewHeader["renderLiveViewHeader()"]
  createBaseLiveItem -.-> appendStreamChunk
  appendStreamChunk -.-> getStreamTail
  getStreamTail -.-> getStreamBytes
  getStreamBytes -.-> getStreamLineCount
  getStreamLineCount -.-> renderLiveViewHeader
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant live_monitor_base as "live-monitor-base"
  participant mariozechner as "@mariozechner"
  participant format_utils as "format-utils"
  participant agent_utils as "agent-utils"

  Caller->>live_monitor_base: createBaseLiveItem()
  live_monitor_base->>mariozechner: API呼び出し
  mariozechner-->>live_monitor_base: レスポンス
  live_monitor_base->>format_utils: 内部関数呼び出し
  format_utils-->>live_monitor_base: 結果
  live_monitor_base-->>Caller: BaseLiveItem

  Caller->>live_monitor_base: appendStreamChunk()
  live_monitor_base-->>Caller: void
```

## 関数

### createBaseLiveItem

```typescript
createBaseLiveItem(input: CreateLiveItemInput): BaseLiveItem
```

デフォルト値を持つベースライブアイテムを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `CreateLiveItemInput` | はい |

**戻り値**: `BaseLiveItem`

### appendStreamChunk

```typescript
appendStreamChunk(item: BaseLiveItem, stream: LiveStreamView, chunk: string): void
```

適切なストリームにチャンクを追加する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| item | `BaseLiveItem` | はい |
| stream | `LiveStreamView` | はい |
| chunk | `string` | はい |

**戻り値**: `void`

### getStreamTail

```typescript
getStreamTail(item: BaseLiveItem, stream: LiveStreamView, autoSwitchOnFailure: boolean): string
```

ビューモードとストリームに基づいて末尾を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| item | `BaseLiveItem` | はい |
| stream | `LiveStreamView` | はい |
| autoSwitchOnFailure | `boolean` | はい |

**戻り値**: `string`

### getStreamBytes

```typescript
getStreamBytes(item: BaseLiveItem, stream: LiveStreamView): number
```

ストリームのバイト数を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| item | `BaseLiveItem` | はい |
| stream | `LiveStreamView` | はい |

**戻り値**: `number`

### getStreamLineCount

```typescript
getStreamLineCount(item: BaseLiveItem, stream: LiveStreamView): number
```

Get estimated stream line count.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| item | `BaseLiveItem` | はい |
| stream | `LiveStreamView` | はい |

**戻り値**: `number`

### renderLiveViewHeader

```typescript
renderLiveViewHeader(data: LiveViewHeaderData, width: number, theme: any): string[]
```

ライブビューの共通ヘッダーを描画する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| data | `LiveViewHeaderData` | はい |
| width | `number` | はい |
| theme | `any` | はい |

**戻り値**: `string[]`

### add

```typescript
add(line: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| line | `any` | はい |

**戻り値**: `void`

### renderListKeyboardHints

```typescript
renderListKeyboardHints(width: number, theme: any): string[]
```

キーボード操作のヒントを描画する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| width | `number` | はい |
| theme | `any` | はい |

**戻り値**: `string[]`

### add

```typescript
add(line: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| line | `any` | はい |

**戻り値**: `void`

### renderDetailKeyboardHints

```typescript
renderDetailKeyboardHints(width: number, theme: any, extraKeys?: string): string[]
```

詳細画面のキーボード操作ヒントを描画する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| width | `number` | はい |
| theme | `any` | はい |
| extraKeys | `string` | いいえ |

**戻り値**: `string[]`

### add

```typescript
add(line: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| line | `any` | はい |

**戻り値**: `void`

### renderListWindow

```typescript
renderListWindow(items: T[], cursor: number, windowSize: number, renderItem: (item: T, index: number, isSelected: boolean) => string, width: number, theme: any): string[]
```

リストウィンドウをページネーション付きで描画する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| items | `T[]` | はい |
| cursor | `number` | はい |
| windowSize | `number` | はい |
| renderItem | `(item: T, index: number, isSelected: boolean) => string` | はい |
| width | `number` | はい |
| theme | `any` | はい |

**戻り値**: `string[]`

### add

```typescript
add(line: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| line | `any` | はい |

**戻り値**: `void`

### renderBaseListItemLine

```typescript
renderBaseListItemLine(item: BaseLiveItem & { name?: string }, index: number, isSelected: boolean, width: number, theme: any, extraMeta?: string): string
```

単一のリストアイテム行を描画する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| item | `BaseLiveItem & { name?: string }` | はい |
| index | `number` | はい |
| isSelected | `boolean` | はい |
| width | `number` | はい |
| theme | `any` | はい |
| extraMeta | `string` | いいえ |

**戻り値**: `string`

### renderSelectedItemSummary

```typescript
renderSelectedItemSummary(items: T[], cursor: number, getItemId: (item: T) => string, getItemName: (item: T) => string | undefined, getItemStatus: (item: T) => LiveItemStatus, getItemElapsed: (item: T) => string, width: number, theme: any, extraInfo?: (item: T) => string | undefined): string[]
```

Render selected item summary.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| items | `T[]` | はい |
| cursor | `number` | はい |
| getItemId | `(item: T) => string` | はい |
| getItemName | `(item: T) => string | undefined` | はい |
| getItemStatus | `(item: T) => LiveItemStatus` | はい |
| getItemElapsed | `(item: T) => string` | はい |
| width | `number` | はい |
| theme | `any` | はい |
| extraInfo | `(item: T) => string | undefined` | いいえ |

**戻り値**: `string[]`

### add

```typescript
add(line: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| line | `any` | はい |

**戻り値**: `void`

### renderDetailHeader

```typescript
renderDetailHeader(item: T, cursor: number, total: number, getItemId: (item: T) => string, getItemName: (item: T) => string | undefined, width: number, theme: any): string[]
```

選択アイテムの詳細ヘッダーを描画する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| item | `T` | はい |
| cursor | `number` | はい |
| total | `number` | はい |
| getItemId | `(item: T) => string` | はい |
| getItemName | `(item: T) => string | undefined` | はい |
| width | `number` | はい |
| theme | `any` | はい |

**戻り値**: `string[]`

### add

```typescript
add(line: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| line | `any` | はい |

**戻り値**: `void`

### renderStreamOutput

```typescript
renderStreamOutput(item: BaseLiveItem, stream: LiveStreamView, width: number, height: number, currentLines: number, theme: any, itemId: string): string[]
```

ストリーム出力セクションを描画する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| item | `BaseLiveItem` | はい |
| stream | `LiveStreamView` | はい |
| width | `number` | はい |
| height | `number` | はい |
| currentLines | `number` | はい |
| theme | `any` | はい |
| itemId | `string` | はい |

**戻り値**: `string[]`

### add

```typescript
add(line: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| line | `any` | はい |

**戻り値**: `void`

### handleListModeInput

```typescript
handleListModeInput(rawInput: string): HandleInputResult
```

リストモードでのキーボード入力を処理する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| rawInput | `string` | はい |

**戻り値**: `HandleInputResult`

### handleDetailModeInput

```typescript
handleDetailModeInput(rawInput: string): HandleInputResult
```

Handle common keyboard input for detail mode.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| rawInput | `string` | はい |

**戻り値**: `HandleInputResult`

### applyInputResult

```typescript
applyInputResult(result: HandleInputResult, state: {
    cursor: number;
    itemCount: number;
    mode: LiveViewMode;
    stream: LiveStreamView;
  }): {
  cursor: number;
  mode: LiveViewMode;
  stream: LiveStreamView;
  shouldClose: boolean;
  shouldRender: boolean;
}
```

入力結果を状態に適用する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `HandleInputResult` | はい |
| state | `{
    cursor: number;
    itemCount: number;
    mode: LiveViewMode;
    stream: LiveStreamView;
  }` | はい |

**戻り値**: `{
  cursor: number;
  mode: LiveViewMode;
  stream: LiveStreamView;
  shouldClose: boolean;
  shouldRender: boolean;
}`

## インターフェース

### BaseLiveItem

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

ライブモニターのアイテムの基底インターフェース

### BaseLiveMonitorController

```typescript
interface BaseLiveMonitorController {
  markStarted: (id: string) => void;
  appendChunk: (id: string, stream: LiveStreamView, chunk: string) => void;
  markFinished: (id: string, status: "completed" | "failed", summary: string, error?: string) => void;
  close: () => void;
  wait: () => Promise<void>;
}
```

ライブモニタコントローラの基底インターフェース

### CreateLiveItemInput

```typescript
interface CreateLiveItemInput {
  id: string;
  name?: string;
}
```

ライブアイテム作成用の入力

### LiveMonitorFactoryOptions

```typescript
interface LiveMonitorFactoryOptions {
  createItem: (input: CreateLiveItemInput) => TItem;
  onStarted?: (item: TItem) => void;
  onChunk?: (item: TItem, stream: LiveStreamView, chunk: string) => void;
  onFinished?: (item: TItem, status: "completed" | "failed", summary: string, error?: string) => void;
}
```

Options for createLiveMonitorFactory.

### LiveViewHeaderData

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

ライブビューの共通ヘッダーデータ

### HandleInputResult

```typescript
interface HandleInputResult {
  handled: boolean;
  action?: "close" | "mode-list" | "mode-detail" | "stream-toggle";
  cursorDelta?: number;
  cursorAbsolute?: number;
}
```

入力処理の結果を表します。

## 型定義

### LiveItemStatus

```typescript
type LiveItemStatus = "pending" | "running" | "completed" | "failed"
```

ライブアイテムの状態。

### LiveStreamView

```typescript
type LiveStreamView = "stdout" | "stderr"
```

ライブストリームの表示オプション

### LiveViewMode

```typescript
type LiveViewMode = "list" | "detail"
```

ライブビューのモードオプション。

---
*自動生成: 2026-02-18T06:37:20.068Z*
