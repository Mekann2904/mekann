---
title: subagent-types
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# subagent-types

## 概要

`subagent-types` モジュールのAPIリファレンス。

## インポート

```typescript
import { LiveStreamView, LiveViewMode } from './tui/live-monitor-base.js';
import { LiveStatus } from './live-view-utils.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| インターフェース | `SubagentLiveItem` | サブエージェントの実行状態を管理するライブアイテム |
| インターフェース | `SubagentMonitorLifecycle` | Lifecycle operations for marking agent execution s |
| インターフェース | `SubagentMonitorStream` | 標準出力/標準エラー出力のチャンク追加操作 |
| インターフェース | `SubagentMonitorResource` | Resource cleanup and termination operations. |
| インターフェース | `SubagentLiveMonitorController` | Full monitor controller combining all capabilities |
| インターフェース | `SubagentNormalizedOutput` | サブエージェントの出力正規化構造 |
| インターフェース | `SubagentParallelCapacityResolution` | サブエージェントの並列容量解決結果 |
| インターフェース | `DelegationState` | 委譲優先ポリシーの状態追跡 |
| インターフェース | `PrintCommandResult` | コマンド実行結果 |
| 型 | `SubagentLiveViewMode` | サブエージェントのライブ監視ビューの表示モード |
| 型 | `SubagentLiveStreamView` | Stream view selection for subagent output display. |

## 図解

### クラス図

```mermaid
classDiagram
  class SubagentLiveItem {
    <<interface>>
    +id: string
    +name: string
    +status: LiveStatus
    +startedAtMs: number
    +finishedAtMs: number
  }
  class SubagentMonitorLifecycle {
    <<interface>>
    +markStarted: agentId_string_vo
    +markFinished: agentId_string_stat
  }
  class SubagentMonitorStream {
    <<interface>>
    +appendChunk: agentId_string_stre
  }
  class SubagentMonitorResource {
    <<interface>>
    +close: void
    +wait: Promise_void
  }
  class SubagentLiveMonitorController {
    <<interface>>
  }
  class SubagentNormalizedOutput {
    <<interface>>
    +summary: string
    +output: string
    +hasResult: boolean
  }
  class SubagentParallelCapacityResolution {
    <<interface>>
    +agentId: string
    +approvedParallelism: number
    +approved: boolean
    +reason: string
  }
  class DelegationState {
    <<interface>>
    +delegatedThisRequest: boolean
    +directWriteConfirmedThisRequest: boolean
    +pendingDirectWriteConfirmUntilMs: number
    +sessionDelegationCalls: number
  }
  class PrintCommandResult {
    <<interface>>
    +output: string
    +latencyMs: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[subagent-types]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    live_monitor_base["live-monitor-base"]
    live_view_utils["live-view-utils"]
  end
  main --> local
```

## インターフェース

### SubagentLiveItem

```typescript
interface SubagentLiveItem {
  id: string;
  name: string;
  status: LiveStatus;
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

サブエージェントの実行状態を管理するライブアイテム

### SubagentMonitorLifecycle

```typescript
interface SubagentMonitorLifecycle {
  markStarted: (agentId: string) => void;
  markFinished: (
    agentId: string,
    status: "completed" | "failed",
    summary: string,
    error?: string,
  ) => void;
}
```

Lifecycle operations for marking agent execution states.
Used by code that only needs to track start/finish transitions.

### SubagentMonitorStream

```typescript
interface SubagentMonitorStream {
  appendChunk: (agentId: string, stream: SubagentLiveStreamView, chunk: string) => void;
}
```

標準出力/標準エラー出力のチャンク追加操作

### SubagentMonitorResource

```typescript
interface SubagentMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}
```

Resource cleanup and termination operations.
Used by code that only needs to manage monitor lifecycle.

### SubagentLiveMonitorController

```typescript
interface SubagentLiveMonitorController {
}
```

Full monitor controller combining all capabilities.
Extends partial interfaces to maintain backward compatibility.
Clients should use narrower interfaces when possible.

### SubagentNormalizedOutput

```typescript
interface SubagentNormalizedOutput {
  summary: string;
  output: string;
  hasResult: boolean;
}
```

サブエージェントの出力正規化構造

### SubagentParallelCapacityResolution

```typescript
interface SubagentParallelCapacityResolution {
  agentId: string;
  approvedParallelism: number;
  approved: boolean;
  reason?: string;
}
```

サブエージェントの並列容量解決結果

### DelegationState

```typescript
interface DelegationState {
  delegatedThisRequest: boolean;
  directWriteConfirmedThisRequest: boolean;
  pendingDirectWriteConfirmUntilMs: number;
  sessionDelegationCalls: number;
}
```

委譲優先ポリシーの状態追跡

### PrintCommandResult

```typescript
interface PrintCommandResult {
  output: string;
  latencyMs: number;
}
```

コマンド実行結果

## 型定義

### SubagentLiveViewMode

```typescript
type SubagentLiveViewMode = LiveViewMode
```

サブエージェントのライブ監視ビューの表示モード

### SubagentLiveStreamView

```typescript
type SubagentLiveStreamView = LiveStreamView
```

Stream view selection for subagent output display.
Alias for base LiveStreamView for semantic clarity.

---
*自動生成: 2026-02-18T07:48:45.294Z*
