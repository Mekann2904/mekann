---
title: live-monitor
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# live-monitor

## 概要

`live-monitor` モジュールのAPIリファレンス。

## インポート

```typescript
import { Key, matchesKey, truncateToWidth } from '@mariozechner/pi-tui';
import { formatDurationMs, formatBytes, formatClockTime } from '../../lib/format-utils.js';
import { appendTail, countOccurrences, estimateLineCount... } from '../../lib/tui/tui-utils.js';
import { toTailLines, looksLikeMarkdown } from '../../lib/live-view-utils.js';
import { computeLiveWindow } from '../../lib/agent-utils.js';
// ... and 2 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `renderSubagentLiveView` | - |
| 関数 | `createSubagentLiveMonitor` | - |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[live-monitor]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    format_utils_js["format-utils.js"]
    tui_utils_js["tui-utils.js"]
    live_view_utils_js["live-view-utils.js"]
    agent_utils_js["agent-utils.js"]
    live_view_utils_js["live-view-utils.js"]
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
  renderSubagentLiveView["renderSubagentLiveView()"]
  createSubagentLiveMonitor["createSubagentLiveMonitor()"]
  renderSubagentLiveView -.-> createSubagentLiveMonitor
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant live_monitor as "live-monitor"
  participant _mariozechner as "@mariozechner"
  participant format_utils_js as "format-utils.js"
  participant tui_utils_js as "tui-utils.js"

  Caller->>live_monitor: renderSubagentLiveView()
  live_monitor->>_mariozechner: API呼び出し
  _mariozechner-->>live_monitor: レスポンス
  live_monitor->>format_utils_js: 内部関数呼び出し
  format_utils_js-->>live_monitor: 結果
  live_monitor-->>Caller: string[]

  Caller->>live_monitor: createSubagentLiveMonitor()
  live_monitor-->>Caller: SubagentLiveMonitorController | undefined
```

## 関数

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

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `{
  title: string;
  items: SubagentLiveItem[];
  cursor: number;
  mode: LiveViewMode;
  stream: LiveStreamView;
  width: number;
  height?: number;
  theme: any;
}` | はい |

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

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `any` | はい |
| input | `{
    title: string;
    items: Array<{ id: string; name: string }>;
  }` | はい |

**戻り値**: `SubagentLiveMonitorController | undefined`

### clearRenderTimer

```typescript
clearRenderTimer(): void
```

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

---
*自動生成: 2026-02-17T22:24:18.870Z*
