---
title: live-monitor-base
category: api-reference
audience: developer
last_updated: 2026-02-17
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
| 関数 | `createBaseLiveItem` | Create a base live item with default values. |
| 関数 | `appendStreamChunk` | Append a chunk to the appropriate stream tail. |
| 関数 | `getStreamTail` | Get the appropriate stream tail based on view mode |
| 関数 | `getStreamBytes` | Get stream bytes count. |
| 関数 | `getStreamLineCount` | Get estimated stream line count. |
| 関数 | `renderLiveViewHeader` | Render common header lines for live views. |
| 関数 | `renderListKeyboardHints` | Render list item keyboard hints. |
| 関数 | `renderDetailKeyboardHints` | Render detail item keyboard hints. |
| 関数 | `renderListWindow` | Render list window with pagination. |
| 関数 | `renderBaseListItemLine` | Render a single list item line (base format). |
| 関数 | `renderSelectedItemSummary` | Render selected item summary. |
| 関数 | `renderDetailHeader` | Render detail header for selected item. |
| 関数 | `renderStreamOutput` | Render stream output section. |
| 関数 | `handleListModeInput` | Handle common keyboard input for list mode. |
| 関数 | `handleDetailModeInput` | Handle common keyboard input for detail mode. |
| 関数 | `applyInputResult` | Apply input result to state. |
| インターフェース | `BaseLiveItem` | Base interface for live monitor items with stream  |
| インターフェース | `BaseLiveMonitorController` | Base interface for live monitor controller. |
| インターフェース | `CreateLiveItemInput` | Input for creating a live item. |
| インターフェース | `LiveMonitorFactoryOptions` | Options for createLiveMonitorFactory. |
| インターフェース | `LiveViewHeaderData` | Common header data for live views. |
| インターフェース | `HandleInputResult` | Result of handling input. |
| 型 | `LiveItemStatus` | Live item status. |
| 型 | `LiveStreamView` | Live stream view options. |
| 型 | `LiveViewMode` | Live view mode options. |

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
    +markStarted: idstring>void
    +appendChunk: idstringstreamLiveStreamViewchunkstring>void
    +markFinished: idstringstatuscompletedfailedsummarystringerrorstring>void
    +close: >void
    +wait: >Promise<void>
  }
  class CreateLiveItemInput {
    <<interface>>
    +id: string
    +name: string
  }
  class LiveMonitorFactoryOptions {
    <<interface>>
    +createItem: inputCreateLiveItemInput>TItem
    +onStarted: itemTItem>void
    +onChunk: itemTItemstreamLiveStreamViewchunkstring>void
    +onFinished: itemTItemstatuscompletedfailedsummarystringerrorstring>void
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
    +action: closemodelistmodedetailstreamtoggle
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
    format_utils_js["format-utils.js"]
    agent_utils_js["agent-utils.js"]
    live_view_utils_js["live-view-utils.js"]
    tui_utils_js["tui-utils.js"]
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
  participant _mariozechner as "@mariozechner"
  participant format_utils_js as "format-utils.js"
  participant agent_utils_js as "agent-utils.js"

  Caller->>live_monitor_base: createBaseLiveItem()
  live_monitor_base->>_mariozechner: API呼び出し
  _mariozechner-->>live_monitor_base: レスポンス
  live_monitor_base->>format_utils_js: 内部関数呼び出し
  format_utils_js-->>live_monitor_base: 結果
  live_monitor_base-->>Caller: BaseLiveItem

  Caller->>live_monitor_base: appendStreamChunk()
  live_monitor_base-->>Caller: void
```

## 関数

### createBaseLiveItem

```typescript
createBaseLiveItem(input: CreateLiveItemInput): BaseLiveItem
```

Create a base live item with default values.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `CreateLiveItemInput` | はい |

**戻り値**: `BaseLiveItem`

### appendStreamChunk

```typescript
appendStreamChunk(item: BaseLiveItem, stream: LiveStreamView, chunk: string): void
```

Append a chunk to the appropriate stream tail.

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

Get the appropriate stream tail based on view mode and stream.
Auto-switches to stderr for failed items with no stdout.

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

Get stream bytes count.

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

Render common header lines for live views.

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

Render list item keyboard hints.

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

Render detail item keyboard hints.

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

Render list window with pagination.

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

Render a single list item line (base format).

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

Render detail header for selected item.

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

Render stream output section.

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

Handle common keyboard input for list mode.

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

Apply input result to state.

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

Base interface for live monitor items with stream data.

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

Base interface for live monitor controller.

### CreateLiveItemInput

```typescript
interface CreateLiveItemInput {
  id: string;
  name?: string;
}
```

Input for creating a live item.

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

Common header data for live views.

### HandleInputResult

```typescript
interface HandleInputResult {
  handled: boolean;
  action?: "close" | "mode-list" | "mode-detail" | "stream-toggle";
  cursorDelta?: number;
  cursorAbsolute?: number;
}
```

Result of handling input.

## 型定義

### LiveItemStatus

```typescript
type LiveItemStatus = "pending" | "running" | "completed" | "failed"
```

Live item status.

### LiveStreamView

```typescript
type LiveStreamView = "stdout" | "stderr"
```

Live stream view options.

### LiveViewMode

```typescript
type LiveViewMode = "list" | "detail"
```

Live view mode options.

---
*自動生成: 2026-02-17T22:24:18.988Z*
