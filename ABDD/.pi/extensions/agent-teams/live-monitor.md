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
import { formatDurationMs, formatBytes, formatClockTime... } from '../../lib/format-utils.js';
import { appendTail, countOccurrences, estimateLineCount... } from '../../lib/tui-utils.js';
import { toTailLines, looksLikeMarkdown, getLiveStatusGlyph... } from '../../lib/live-view-utils.js';
import { computeLiveWindow } from '../../lib/agent-utils.js';
// ... and 1 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `toTeamLiveItemKey` | - |
| 関数 | `renderAgentTeamLiveView` | - |
| 関数 | `createAgentTeamLiveMonitor` | - |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[live-monitor]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    format_utils_js[format-utils.js]
    tui_utils_js[tui-utils.js]
    live_view_utils_js[live-view-utils.js]
    agent_utils_js[agent-utils.js]
    team_types_js[team-types.js]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner[@mariozechner]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  toTeamLiveItemKey["toTeamLiveItemKey()"]
  renderAgentTeamLiveView["renderAgentTeamLiveView()"]
  createAgentTeamLiveMonitor["createAgentTeamLiveMonitor()"]
  toTeamLiveItemKey -.-> renderAgentTeamLiveView
  renderAgentTeamLiveView -.-> createAgentTeamLiveMonitor
```

## 関数

### formatLivePhase

```typescript
formatLivePhase(phase: TeamLivePhase, round?: number): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| phase | `TeamLivePhase` | はい |
| round | `number` | いいえ |

**戻り値**: `string`

### pushLiveEvent

```typescript
pushLiveEvent(item: TeamLiveItem, rawEvent: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| item | `TeamLiveItem` | はい |
| rawEvent | `string` | はい |

**戻り値**: `void`

### toEventTailLines

```typescript
toEventTailLines(events: string[], limit: number): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| events | `string[]` | はい |
| limit | `number` | はい |

**戻り値**: `string[]`

### toTeamLiveItemKey

```typescript
toTeamLiveItemKey(teamId: string, memberId: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| teamId | `string` | はい |
| memberId | `string` | はい |

**戻り値**: `string`

### renderAgentTeamLiveView

```typescript
renderAgentTeamLiveView(input: {
  title: string;
  items: TeamLiveItem[];
  globalEvents: string[];
  cursor: number;
  mode: TeamLiveViewMode;
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
  items: TeamLiveItem[];
  globalEvents: string[];
  cursor: number;
  mode: TeamLiveViewMode;
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

### createAgentTeamLiveMonitor

```typescript
createAgentTeamLiveMonitor(ctx: any, input: {
    title: string;
    items: Array<{ key: string; label: string; partners?: string[] }>;
  }): AgentTeamLiveMonitorController | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `any` | はい |
| input | `{
    title: string;
    items: Array<{ key: string; label: string; partners?: string[] }>;
  }` | はい |

**戻り値**: `AgentTeamLiveMonitorController | undefined`

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
*自動生成: 2026-02-17T21:48:27.459Z*
