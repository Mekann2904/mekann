---
title: team-types
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# team-types

## 概要

`team-types` モジュールのAPIリファレンス。

## インポート

```typescript
// from './tui/live-monitor-base.js': LiveStreamView
// from './live-view-utils.js': LiveStatus
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| インターフェース | `TeamLiveItem` | Live item tracking for team member execution. |
| インターフェース | `TeamMonitorLifecycle` | Lifecycle operations for marking team member execu |
| インターフェース | `TeamMonitorPhase` | チームメンバーの実行フェーズ操作 |
| インターフェース | `TeamMonitorEvents` | 実行イベントを記録するための操作。イベントのログ記録のみを行うコードで使用されます。 |
| インターフェース | `TeamMonitorStream` | Stream output operations for appending stdout/stde |
| インターフェース | `TeamMonitorDiscussion` | Discussion tracking operations for multi-agent com |
| インターフェース | `TeamMonitorResource` | リソースのクリーンアップと終了操作。 |
| インターフェース | `AgentTeamLiveMonitorController` | エージェントチームのライブ監視を制御するインターフェース |
| インターフェース | `TeamNormalizedOutput` | チームメンバー実行の正規化された出力構造。 |
| インターフェース | `TeamParallelCapacityCandidate` | Candidate for parallel capacity allocation. |
| インターフェース | `TeamParallelCapacityResolution` | チーム並列容量の解決結果 |
| インターフェース | `TeamFrontmatter` | チーム定義のフロントマター構造 |
| インターフェース | `TeamMemberFrontmatter` | チームメンバーのフロントマター |
| インターフェース | `ParsedTeamMarkdown` | パースされたチームMarkdownファイル構造 |
| 型 | `TeamLivePhase` | Team execution phase during orchestration. |
| 型 | `TeamLiveViewMode` | View mode for team live monitoring interface. |

## 図解

### クラス図

```mermaid
classDiagram
  class TeamLiveItem {
    <<interface>>
    +key: string
    +label: string
    +partners: string
    +status: LiveStatus
    +phase: TeamLivePhase
  }
  class TeamMonitorLifecycle {
    <<interface>>
    +markStarted: itemKey_string_vo
    +markFinished: itemKey_string_stat
  }
  class TeamMonitorPhase {
    <<interface>>
    +markPhase: itemKey_string_phas
  }
  class TeamMonitorEvents {
    <<interface>>
    +appendEvent: itemKey_string_even
    +appendBroadcastEvent: event_string_void
  }
  class TeamMonitorStream {
    <<interface>>
    +appendChunk: itemKey_string_stre
  }
  class TeamMonitorDiscussion {
    <<interface>>
    +appendDiscussion: itemKey_string_disc
  }
  class TeamMonitorResource {
    <<interface>>
    +close: void
    +wait: Promise_void
  }
  class AgentTeamLiveMonitorController {
    <<interface>>
  }
  class TeamNormalizedOutput {
    <<interface>>
    +summary: string
    +output: string
    +evidenceCount: number
    +hasDiscussion: boolean
  }
  class TeamParallelCapacityCandidate {
    <<interface>>
    +teamId: string
    +parallelism: number
  }
  class TeamParallelCapacityResolution {
    <<interface>>
    +teamId: string
    +approvedParallelism: number
    +approved: boolean
    +reason: string
  }
  class TeamFrontmatter {
    <<interface>>
    +id: string
    +name: string
    +description: string
    +enabled: enabled_disabled
    +strategy: parallel_sequenti
  }
  class TeamMemberFrontmatter {
    <<interface>>
    +id: string
    +role: string
    +description: string
    +enabled: boolean
    +provider: string
  }
  class ParsedTeamMarkdown {
    <<interface>>
    +frontmatter: TeamFrontmatter
    +content: string
    +filePath: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[team-types]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    live_monitor_base["live-monitor-base"]
    live_view_utils["live-view-utils"]
  end
  main --> local
```

## インターフェース

### TeamLiveItem

```typescript
interface TeamLiveItem {
  key: string;
  label: string;
  partners: string[];
  status: LiveStatus;
  phase: TeamLivePhase;
  phaseRound?: number;
  startedAtMs?: number;
  finishedAtMs?: number;
  lastChunkAtMs?: number;
  lastEventAtMs?: number;
  lastEvent?: string;
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
  events: string[];
  discussionTail: string;
  discussionBytes: number;
  discussionNewlineCount: number;
  discussionEndsWithNewline: boolean;
}
```

Live item tracking for team member execution.
Maintains real-time state for TUI rendering.

### TeamMonitorLifecycle

```typescript
interface TeamMonitorLifecycle {
  markStarted: (itemKey: string) => void;
  markFinished: (
    itemKey: string,
    status: "completed" | "failed",
    summary: string,
    error?: string,
  ) => void;
}
```

Lifecycle operations for marking team member execution states.
Used by code that only needs to track start/finish transitions.

### TeamMonitorPhase

```typescript
interface TeamMonitorPhase {
  markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => void;
}
```

チームメンバーの実行フェーズ操作

### TeamMonitorEvents

```typescript
interface TeamMonitorEvents {
  appendEvent: (itemKey: string, event: string) => void;
  appendBroadcastEvent: (event: string) => void;
}
```

実行イベントを記録するための操作。イベントのログ記録のみを行うコードで使用されます。

### TeamMonitorStream

```typescript
interface TeamMonitorStream {
  appendChunk: (itemKey: string, stream: LiveStreamView, chunk: string) => void;
}
```

Stream output operations for appending stdout/stderr chunks.
Used by code that only needs to handle output streaming.

### TeamMonitorDiscussion

```typescript
interface TeamMonitorDiscussion {
  appendDiscussion: (itemKey: string, discussion: string) => void;
}
```

Discussion tracking operations for multi-agent communication.
Used by code that only needs to track discussion content.

### TeamMonitorResource

```typescript
interface TeamMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}
```

リソースのクリーンアップと終了操作。

### AgentTeamLiveMonitorController

```typescript
interface AgentTeamLiveMonitorController {
}
```

エージェントチームのライブ監視を制御するインターフェース

### TeamNormalizedOutput

```typescript
interface TeamNormalizedOutput {
  summary: string;
  output: string;
  evidenceCount: number;
  hasDiscussion: boolean;
}
```

チームメンバー実行の正規化された出力構造。

### TeamParallelCapacityCandidate

```typescript
interface TeamParallelCapacityCandidate {
  teamId: string;
  parallelism: number;
}
```

Candidate for parallel capacity allocation.
Used in team parallel execution planning.

### TeamParallelCapacityResolution

```typescript
interface TeamParallelCapacityResolution {
  teamId: string;
  approvedParallelism: number;
  approved: boolean;
  reason?: string;
}
```

チーム並列容量の解決結果

### TeamFrontmatter

```typescript
interface TeamFrontmatter {
  id: string;
  name: string;
  description: string;
  enabled: "enabled" | "disabled";
  strategy?: "parallel" | "sequential";
  skills?: string[];
  members: TeamMemberFrontmatter[];
}
```

チーム定義のフロントマター構造

### TeamMemberFrontmatter

```typescript
interface TeamMemberFrontmatter {
  id: string;
  role: string;
  description: string;
  enabled?: boolean;
  provider?: string;
  model?: string;
  skills?: string[];
}
```

チームメンバーのフロントマター

### ParsedTeamMarkdown

```typescript
interface ParsedTeamMarkdown {
  frontmatter: TeamFrontmatter;
  content: string;
  filePath: string;
}
```

パースされたチームMarkdownファイル構造

## 型定義

### TeamLivePhase

```typescript
type TeamLivePhase = | "queued"
  | "initial"
  | "communication"
  | "judge"
  | "finished"
```

Team execution phase during orchestration.
Tracks the current stage of team member execution.

### TeamLiveViewMode

```typescript
type TeamLiveViewMode = "list" | "detail" | "discussion"
```

View mode for team live monitoring interface.
Extends base LiveViewMode with "discussion" mode.

---
*自動生成: 2026-02-18T14:31:31.039Z*
