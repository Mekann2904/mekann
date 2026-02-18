---
title: live-monitor
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# live-monitor

## 概要

`live-monitor` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-tui': Key, matchesKey, truncateToWidth
// from '../../lib/format-utils.js': formatDurationMs, formatBytes, formatClockTime, ...
// from '../../lib/tui/tui-utils.js': appendTail, countOccurrences, estimateLineCount, ...
// from '../../lib/live-view-utils.js': toTailLines, looksLikeMarkdown, getLiveStatusGlyph, ...
// from '../../lib/agent-utils.js': computeLiveWindow
// ... and 1 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `toTeamLiveItemKey` | チームIDとメンバーIDからキー生成 |
| 関数 | `renderAgentTeamLiveView` | ライブビューを描画 |
| 関数 | `createAgentTeamLiveMonitor` | ライブ監視を生成 |

## 図解

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
    team_types["team-types"]
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
  clearRenderTimer["clearRenderTimer()"]
  close["close()"]
  createAgentTeamLiveMonitor["createAgentTeamLiveMonitor()"]
  formatLivePhase["formatLivePhase()"]
  pushLiveEvent["pushLiveEvent()"]
  queueRender["queueRender()"]
  renderAgentTeamLiveView["renderAgentTeamLiveView()"]
  toEventTailLines["toEventTailLines()"]
  toTeamLiveItemKey["toTeamLiveItemKey()"]
  close --> clearRenderTimer
  createAgentTeamLiveMonitor --> clearRenderTimer
  createAgentTeamLiveMonitor --> close
  createAgentTeamLiveMonitor --> formatLivePhase
  createAgentTeamLiveMonitor --> pushLiveEvent
  createAgentTeamLiveMonitor --> queueRender
  createAgentTeamLiveMonitor --> renderAgentTeamLiveView
  renderAgentTeamLiveView --> add
  renderAgentTeamLiveView --> formatLivePhase
  renderAgentTeamLiveView --> toEventTailLines
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

  Caller->>live_monitor: toTeamLiveItemKey()
  live_monitor->>mariozechner: API呼び出し
  mariozechner-->>live_monitor: レスポンス
  live_monitor->>format_utils: 内部関数呼び出し
  format_utils-->>live_monitor: 結果
  live_monitor-->>Caller: string

  Caller->>live_monitor: renderAgentTeamLiveView()
  live_monitor-->>Caller: string
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

チームIDとメンバーIDからキー生成

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

ライブビューを描画

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ title | `string` | はい |
| &nbsp;&nbsp;↳ items | `TeamLiveItem[]` | はい |
| &nbsp;&nbsp;↳ globalEvents | `string[]` | はい |
| &nbsp;&nbsp;↳ cursor | `number` | はい |
| &nbsp;&nbsp;↳ mode | `TeamLiveViewMode` | はい |
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

### createAgentTeamLiveMonitor

```typescript
createAgentTeamLiveMonitor(ctx: any, input: {
    title: string;
    items: Array<{ key: string; label: string; partners?: string[] }>;
  }): AgentTeamLiveMonitorController | undefined
```

ライブ監視を生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `any` | はい |
| input | `object` | はい |
| &nbsp;&nbsp;↳ title | `string` | はい |
| &nbsp;&nbsp;↳ items | `Array<{ key: string; label: string; partners?: string[] }>` | はい |

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
*自動生成: 2026-02-18T15:54:40.924Z*
