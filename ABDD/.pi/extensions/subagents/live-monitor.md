---
title: live-monitor
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# live-monitor

## 概要

`live-monitor` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-tui': Key, matchesKey
// from '../../lib/format-utils.js': formatDurationMs, formatBytes, formatClockTime, ...
// from '../../lib/tui/tui-utils.js': appendTail, countOccurrences, estimateLineCount, ...
// from '../../lib/live-view-utils.js': toTailLines, looksLikeMarkdown
// from '../../lib/agent-utils.js': computeLiveWindow
// ... and 2 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `renderSubagentLiveView` | ライブビューを描画 |
| 関数 | `createSubagentLiveMonitor` | ライブ監視コントローラ作成 |

## 図解

### クラス図

```mermaid
classDiagram
  class TimelineEvent {
    <<interface>>
    +time: string
    +agent: string
    +type: start_done_fail
    +content: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[live-monitor]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    format_utils["format-utils"]
    tui_utils["tui-utils"]
    live_view_utils["live-view-utils"]
    agent_utils["agent-utils"]
    live_view_utils["live-view-utils"]
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
  add["add()"]
  clearPollTimer["clearPollTimer()"]
  clearRenderTimer["clearRenderTimer()"]
  close["close()"]
  createSubagentLiveMonitor["createSubagentLiveMonitor()"]
  hasRunningItems["hasRunningItems()"]
  queueRender["queueRender()"]
  renderSubagentLiveView["renderSubagentLiveView()"]
  renderSubagentTimelineView["renderSubagentTimelineView()"]
  renderSubagentTreeView["renderSubagentTreeView()"]
  startPolling["startPolling()"]
  close --> clearPollTimer
  close --> clearRenderTimer
  createSubagentLiveMonitor --> clearPollTimer
  createSubagentLiveMonitor --> clearRenderTimer
  createSubagentLiveMonitor --> close
  createSubagentLiveMonitor --> hasRunningItems
  createSubagentLiveMonitor --> queueRender
  createSubagentLiveMonitor --> renderSubagentLiveView
  createSubagentLiveMonitor --> startPolling
  renderSubagentLiveView --> add
  renderSubagentLiveView --> renderSubagentTimelineView
  renderSubagentLiveView --> renderSubagentTreeView
  renderSubagentTimelineView --> add
  renderSubagentTreeView --> add
  startPolling --> clearPollTimer
  startPolling --> hasRunningItems
  startPolling --> queueRender
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant live_monitor as "live-monitor"
  participant mariozechner as "@mariozechner"
  participant format_utils as "format-utils"
  participant tui_utils as "tui-utils"

  Caller->>live_monitor: renderSubagentLiveView()
  live_monitor->>mariozechner: API呼び出し
  mariozechner-->>live_monitor: レスポンス
  live_monitor->>format_utils: 内部関数呼び出し
  format_utils-->>live_monitor: 結果
  live_monitor-->>Caller: string

  Caller->>live_monitor: createSubagentLiveMonitor()
  live_monitor-->>Caller: SubagentLiveMonitorC
```

## 関数

### renderSubagentTreeView

```typescript
renderSubagentTreeView(items: SubagentLiveItem[], cursor: number, width: number, theme: any): string[]
```

サブエージェントのツリービューを描画

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| items | `SubagentLiveItem[]` | はい |
| cursor | `number` | はい |
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

### renderSubagentTimelineView

```typescript
renderSubagentTimelineView(items: SubagentLiveItem[], width: number, theme: any): string[]
```

サブエージェントのタイムラインビューを描画

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| items | `SubagentLiveItem[]` | はい |
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

### renderSubagentLiveView

```typescript
renderSubagentLiveView(input: {
  title: string;
  items: SubagentLiveItem[];
  cursor: number;
  mode: LiveViewMode;
  stream: LiveStreamView;
  width: number;
  height?: number;
  theme: any;
}): string[]
```

ライブビューを描画

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ title | `string` | はい |
| &nbsp;&nbsp;↳ items | `SubagentLiveItem[]` | はい |
| &nbsp;&nbsp;↳ cursor | `number` | はい |
| &nbsp;&nbsp;↳ mode | `LiveViewMode` | はい |
| &nbsp;&nbsp;↳ stream | `LiveStreamView` | はい |
| &nbsp;&nbsp;↳ width | `number` | はい |
| &nbsp;&nbsp;↳ height | `number` | いいえ |
| &nbsp;&nbsp;↳ theme | `any` | はい |

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

### createSubagentLiveMonitor

```typescript
createSubagentLiveMonitor(ctx: any, input: {
    title: string;
    items: Array<{ id: string; name: string }>;
  }): SubagentLiveMonitorController | undefined
```

ライブ監視コントローラ作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `any` | はい |
| input | `object` | はい |
| &nbsp;&nbsp;↳ title | `string` | はい |
| &nbsp;&nbsp;↳ items | `Array<{ id: string; name: string }>` | はい |

**戻り値**: `SubagentLiveMonitorController | undefined`

### clearRenderTimer

```typescript
clearRenderTimer(): void
```

**戻り値**: `void`

### clearPollTimer

```typescript
clearPollTimer(): void
```

**戻り値**: `void`

### hasRunningItems

```typescript
hasRunningItems(): boolean
```

実行中のアイテムがあるかチェック

**戻り値**: `boolean`

### startPolling

```typescript
startPolling(): void
```

定期ポーリングを開始（ストリーミングがない期間もUIを更新）

**戻り値**: `void`

### queueRender

```typescript
queueRender(): void
```

**戻り値**: `void`

### close

```typescript
close(): void
```

**戻り値**: `void`

## インターフェース

### TimelineEvent

```typescript
interface TimelineEvent {
  time: string;
  agent: string;
  type: "start" | "done" | "fail" | "output";
  content: string;
}
```

---
*自動生成: 2026-02-24T17:08:02.490Z*
