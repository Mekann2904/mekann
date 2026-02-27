---
title: 所有権システム (Ownership System)
category: reference
audience: developer
last_updated: 2026-02-28
tags: [ownership, concurrency, workflow, delegation]
related: [ul-workflow, subagents, agent-teams]
---

# 所有権システム

## 概要

所有権システムは、複数のpiインスタンスが同時に**同じタスク**を操作することを防ぎ、データ破損を回避します。

**重要**: 2026-02-28以降、**タスクIDごとの所有権管理**に変更されました。複数のpiインスタンスは、**異なるタスクであれば同時に並列実行可能**です。

## アーキテクチャ

### 複数ワークフロー対応

各タスクは独立した所有権を持ちます：

```
.pi/ul-workflow/tasks/
├── task-1/
│   └── state.json  → ownerInstanceId: "session-a-12345"
├── task-2/
│   └── state.json  → ownerInstanceId: "session-b-67890"
└── task-3/
    └── state.json  → ownerInstanceId: "session-a-12345"
```

- **インスタンスA**: task-1, task-3 を所有
- **インスタンスB**: task-2 を所有
- 両者は**同時に並列実行可能**

### インスタンスID

各piプロセスは起動時に一意のインスタンスIDを生成します：

```
{PI_SESSION_ID}-{pid}
```

例: `my-session-12345`

- `PI_SESSION_ID`: 環境変数で設定可能（デフォルト: `default`）
- `pid`: プロセスID

### 所有権チェック

```typescript
checkUlWorkflowOwnership(taskId)
```

1. 指定されたタスクIDの `state.json` を読み込み
2. 現在のインスタンスIDと `ownerInstanceId` を比較
3. 一致 → 許可
4. 不一致 → オーナープロセスの生存確認
5. オーナー死亡 → 所有権取得可能
6. オーナー生存 → エラー

## 使用方法

### 新しいワークフローの開始

`ul_workflow_start` または `ul_workflow_run` を呼び出すと、**常に新しいタスクが作成**されます。グローバルな競合チェックはありません。

```typescript
// インスタンスA
ul_workflow_start({ task: "バグを修正する" })
// → taskId: task-A, owner: instance-A

// インスタンスB（同時実行可能）
ul_workflow_start({ task: "機能を追加する" })
// → taskId: task-B, owner: instance-B
```

### ulTaskIdパラメータ

委任ツールに `ulTaskId` を渡すと、**その特定タスクの所有権チェック**が有効になります：

```typescript
subagent_run({
  subagentId: "implementer",
  task: "Implement feature X",
  ulTaskId: "2026-02-25T18-44-58--edb94a81"  // このタスクIDの所有権をチェック
})
```

### 対応ツール

| ツール | ulTaskId サポート |
|--------|------------------|
| `subagent_run` | OK |
| `subagent_run_parallel` | OK |
| `subagent_run_dag` | OK |
| `agent_team_run` | OK |
| `agent_team_run_parallel` | OK |
| `loop_run` | OK |

## API

### checkUlWorkflowOwnership

```typescript
function checkUlWorkflowOwnership(taskId: string): UlWorkflowOwnershipResult
```

**パラメータ**:
- `taskId`: ULワークフローのタスクID

**戻り値**:
```typescript
interface UlWorkflowOwnershipResult {
  owned: boolean;           // 所有権を持っているか
  ownerInstanceId?: string; // 現在のオーナーインスタンスID
  ownerPid?: number;        // 現在のオーナープロセスID
}
```

### getInstanceId

```typescript
function getInstanceId(): string
```

現在のインスタンスIDを返します。

### isProcessAlive

```typescript
function isProcessAlive(pid: number): boolean
```

指定されたPIDのプロセスが生存しているか確認します。

### extractPidFromInstanceId

```typescript
function extractPidFromInstanceId(instanceId: string): number | null
```

インスタンスIDからPIDを抽出します。

## エラー対処

### workflow_owned_by_other

**原因**: 別のpiインスタンスが**同じタスクID**を実行中

**対処**:
1. オーナープロセスが実行中か確認: `ps -p {pid}`
2. 実行中 → 完了まで待機
3. 終了済み → `ul_workflow_force_claim` で強制取得

### ul_workflow_not_owned

**原因**: 委任ツールが所有権なしでタスクを操作しようとした

**対処**: `ulTaskId` パラメータを追加

## 設計変更履歴

### 2026-02-28: タスクIDごとの所有権管理

**変更前**: グローバルに1つのアクティブワークフローのみ許可
- `active.json` で単一のアクティブタスクを管理
- 新しいワークフロー開始時に他のインスタンスをブロック

**変更後**: タスクIDごとに独立した所有権
- 各タスクの `state.json` で所有権を管理
- 複数インスタンスが同時に異なるタスクを実行可能
- `active.json` は「このインスタンスのカレントタスク」参照として維持

## 実装ガイド

### 新しいツールへの追加

1. パラメータスキーマに追加:

```typescript
parameters: Type.Object({
  // ... existing params
  ulTaskId: Type.Optional(Type.String({
    description: "UL workflow task ID. If provided, checks ownership before execution."
  })),
}),
```

2. 所有権チェックを追加:

```typescript
async execute(_toolCallId, params, signal, _onUpdate, ctx) {
  if (params.ulTaskId) {
    const ownership = checkUlWorkflowOwnership(params.ulTaskId);
    if (!ownership.owned) {
      return {
        content: [{ type: "text", text: `error: UL workflow ${params.ulTaskId} is owned by another instance (${ownership.ownerInstanceId}).` }],
        details: {
          error: "ul_workflow_not_owned",
          ulTaskId: params.ulTaskId,
          ownerInstanceId: ownership.ownerInstanceId,
          ownerPid: ownership.ownerPid,
          outcomeCode: "NONRETRYABLE_FAILURE",
          retryRecommended: false,
        },
      };
    }
  }
  // ... continue
}
```

3. インポート追加:

```typescript
import { checkUlWorkflowOwnership } from "../subagents.js";  // or "./subagents.js"
```

## 制限事項

- プロセス生存確認は同一マシンのみ対応
- ファイルベースの状態管理のため、ネットワークファイルシステムでは競合の可能性あり

## 関連ファイル

| ファイル | 説明 |
|---------|------|
| `.pi/extensions/ul-workflow.ts` | 所有権コア関数 |
| `.pi/extensions/subagents.ts` | checkUlWorkflowOwnership関数 |
