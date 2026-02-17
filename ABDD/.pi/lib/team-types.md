---
title: Team Types
category: reference
audience: developer
last_updated: 2026-02-18
tags: [team, types, live-monitoring, orchestration]
related: [live-monitor-base, subagent-types]
---

# Team Types

チームオーケストレーション関連の型定義。

## Types

### TeamLivePhase

オーケストレーション中のチーム実行フェーズ。

```typescript
type TeamLivePhase =
  | "queued"
  | "initial"
  | "communication"
  | "judge"
  | "finished";
```

### TeamLiveViewMode

チームライブモニタリングインターフェースのビューモード。

```typescript
type TeamLiveViewMode = "list" | "detail" | "discussion";
```

### TeamLiveItem

チームメンバー実行のライブアイテム追跡。TUIレンダリング用のリアルタイム状態を保持。

```typescript
interface TeamLiveItem {
  /** ユニークキー: teamId/memberId */
  key: string;
  /** 表示ラベル */
  label: string;
  /** コミュニケーションパートナー（メンバーID） */
  partners: string[];
  /** 現在の実行ステータス */
  status: LiveStatus;
  /** 現在の実行フェーズ */
  phase: TeamLivePhase;
  /** コミュニケーションラウンド番号（communicationフェーズ時） */
  phaseRound?: number;
  /** 実行開始タイムスタンプ */
  startedAtMs?: number;
  /** 実行終了タイムスタンプ */
  finishedAtMs?: number;
  /** 最後の出力チャンクタイムスタンプ */
  lastChunkAtMs?: number;
  /** 最後のイベントタイムスタンプ */
  lastEventAtMs?: number;
  /** 最後のイベント説明 */
  lastEvent?: string;
  /** 実行サマリー */
  summary?: string;
  /** 失敗時のエラーメッセージ */
  error?: string;
  /** 最近のstdout行 */
  stdoutTail: string;
  /** 最近のstderr行 */
  stderrTail: string;
  /** stdout合計バイト数 */
  stdoutBytes: number;
  /** stderr合計バイト数 */
  stderrBytes: number;
  /** stdout改行数 */
  stdoutNewlineCount: number;
  /** stderr改行数 */
  stderrNewlineCount: number;
  /** stdoutが改行で終わるか */
  stdoutEndsWithNewline: boolean;
  /** stderrが改行で終わるか */
  stderrEndsWithNewline: boolean;
  /** イベントログエントリ */
  events: string[];
  /** ディスカッションコンテンツテール */
  discussionTail: string;
  /** ディスカッションバイト数 */
  discussionBytes: number;
  /** ディスカッション改行数 */
  discussionNewlineCount: number;
  /** ディスカッションが改行で終わるか */
  discussionEndsWithNewline: boolean;
}
```

## Interfaces (ISP-Compliant)

### TeamMonitorLifecycle

チームメンバー実行状態のマーキング用ライフサイクル操作。

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

### TeamMonitorPhase

チームメンバー実行フェーズのフェーズ追跡操作。

```typescript
interface TeamMonitorPhase {
  markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => void;
}
```

### TeamMonitorEvents

実行イベント追跡用のイベントロギング操作。

```typescript
interface TeamMonitorEvents {
  appendEvent: (itemKey: string, event: string) => void;
  appendBroadcastEvent: (event: string) => void;
}
```

### TeamMonitorStream

stdout/stderrチャンク追加用ストリーム出力操作。

```typescript
interface TeamMonitorStream {
  appendChunk: (itemKey: string, stream: LiveStreamView, chunk: string) => void;
}
```

### TeamMonitorDiscussion

マルチエージェントコミュニケーション用のディスカッション追跡操作。

```typescript
interface TeamMonitorDiscussion {
  appendDiscussion: (itemKey: string, discussion: string) => void;
}
```

### TeamMonitorResource

リソースクリーンアップと終了操作。

```typescript
interface TeamMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}
```

### AgentTeamLiveMonitorController

全機能を統合したモニターコントローラー。

```typescript
interface AgentTeamLiveMonitorController
  extends TeamMonitorLifecycle,
    TeamMonitorPhase,
    TeamMonitorEvents,
    TeamMonitorStream,
    TeamMonitorDiscussion,
    TeamMonitorResource {}
```

## Parallel Execution Types

### TeamNormalizedOutput

チームメンバー実行の正規化された出力構造。

```typescript
interface TeamNormalizedOutput {
  /** 抽出されたサマリー */
  summary: string;
  /** 完全な出力コンテンツ */
  output: string;
  /** 出力からの証拠数 */
  evidenceCount: number;
  /** ディスカッションセクションを含むか */
  hasDiscussion: boolean;
}
```

### TeamParallelCapacityCandidate

並列容量割り当ての候補。

```typescript
interface TeamParallelCapacityCandidate {
  /** チームID */
  teamId: string;
  /** 要求された並列数 */
  parallelism: number;
}
```

### TeamParallelCapacityResolution

チーム並列容量の解決結果。

```typescript
interface TeamParallelCapacityResolution {
  /** チームID */
  teamId: string;
  /** 承認された並列数 */
  approvedParallelism: number;
  /** リクエストが承認されたか */
  approved: boolean;
  /** 却下理由（承認されなかった場合） */
  reason?: string;
}
```

## Frontmatter Types

### TeamFrontmatter

Markdownチーム定義用のチームフロントマター構造。

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

### TeamMemberFrontmatter

Markdownパース用のチームメンバーフロントマター。

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

### ParsedTeamMarkdown

パースされたチームMarkdownファイル構造。

```typescript
interface ParsedTeamMarkdown {
  frontmatter: TeamFrontmatter;
  content: string;
  filePath: string;
}
```

## Re-exports

- `LiveStreamView` from `./live-monitor-base.js`

## 関連ファイル

- `.pi/extensions/agent-teams.ts` - エージェントチーム拡張
- `.pi/extensions/agent-teams/storage.ts` - チームストレージ
- `.pi/lib/live-monitor-base.ts` - ライブモニタリング基底
