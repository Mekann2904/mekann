---
title: Subagent Types
category: reference
audience: developer
last_updated: 2026-02-18
tags: [subagent, types, live-monitoring]
related: [live-monitor-base, live-view-utils]
---

# Subagent Types

サブエージェント関連の型定義。サブエージェントライブモニタリングシステムと並列実行調整で使用される。

## Types

### SubagentLiveViewMode

ライブモニタリングインターフェースのビューモード。

```typescript
type SubagentLiveViewMode = LiveViewMode;
```

### SubagentLiveStreamView

サブエージェント出力表示のストリームビュー選択。

```typescript
type SubagentLiveStreamView = LiveStreamView;
```

### SubagentLiveItem

サブエージェント実行のライブアイテム追跡。TUIレンダリング用のリアルタイム状態を保持。

```typescript
interface SubagentLiveItem {
  /** サブエージェントID */
  id: string;
  /** サブエージェント名 */
  name: string;
  /** 現在の実行ステータス */
  status: LiveStatus;
  /** 実行開始タイムスタンプ */
  startedAtMs?: number;
  /** 実行終了タイムスタンプ */
  finishedAtMs?: number;
  /** 最後の出力チャンクタイムスタンプ */
  lastChunkAtMs?: number;
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
}
```

## Interfaces (ISP-Compliant)

### SubagentMonitorLifecycle

エージェント実行状態のマーキング用ライフサイクル操作。開始/終了遷移の追跡のみが必要なコードで使用。

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

### SubagentMonitorStream

stdout/stderrチャンクの追加用ストリーム出力操作。

```typescript
interface SubagentMonitorStream {
  appendChunk: (agentId: string, stream: SubagentLiveStreamView, chunk: string) => void;
}
```

### SubagentMonitorResource

リソースクリーンアップと終了操作。

```typescript
interface SubagentMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}
```

### SubagentLiveMonitorController

全機能を統合したモニターコントローラー。後方互換性のため部分インターフェースを拡張。

```typescript
interface SubagentLiveMonitorController
  extends SubagentMonitorLifecycle,
    SubagentMonitorStream,
    SubagentMonitorResource {}
```

## Parallel Execution Types

### SubagentNormalizedOutput

サブエージェント実行の正規化された出力構造。

```typescript
interface SubagentNormalizedOutput {
  /** 抽出されたサマリー */
  summary: string;
  /** 完全な出力コンテンツ */
  output: string;
  /** 結果セクションを含むか */
  hasResult: boolean;
}
```

### SubagentParallelCapacityResolution

サブエージェント並列容量の解決結果。容量ネゴシエーション後の実際の並列数を決定。

```typescript
interface SubagentParallelCapacityResolution {
  /** サブエージェントID */
  agentId: string;
  /** 承認された並列数 */
  approvedParallelism: number;
  /** リクエストが承認されたか */
  approved: boolean;
  /** 却下理由（承認されなかった場合） */
  reason?: string;
}
```

## Delegation State Types

### DelegationState

Delegation-firstポリシー強制用の状態追跡。

```typescript
interface DelegationState {
  /** このリクエストでデリゲーションツールが呼ばれたか */
  delegatedThisRequest: boolean;
  /** このリクエストで直接書き込みが確認されたか */
  directWriteConfirmedThisRequest: boolean;
  /** 直接書き込み確認の有効期限タイムスタンプ */
  pendingDirectWriteConfirmUntilMs: number;
  /** このセッションでのデリゲーション呼び出し総数 */
  sessionDelegationCalls: number;
}
```

### PrintCommandResult

printモード実行追跡用のコマンド実行結果。

```typescript
interface PrintCommandResult {
  /** 出力コンテンツ */
  output: string;
  /** 実行レイテンシ（ミリ秒） */
  latencyMs: number;
}
```

## Re-exports

以下の型を再エクスポート:

- `LiveStreamView` from `./live-monitor-base.js`
- `LiveViewMode` from `./live-monitor-base.js`

## 関連ファイル

- `.pi/extensions/subagents.ts` - サブエージェント拡張
- `.pi/extensions/subagents/storage.ts` - サブエージェントストレージ
- `.pi/lib/live-monitor-base.ts` - ライブモニタリング基底
- `.pi/lib/live-view-utils.ts` - ライブビューユーティリティ
