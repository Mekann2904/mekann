---
title: 所有権システム (Ownership System)
category: reference
audience: developer
last_updated: 2026-02-26
tags: [ownership, concurrency, workflow, delegation]
related: [ul-workflow, subagents, agent-teams]
---

# 所有権システム

## 概要

所有権システムは、複数のpiインスタンスが同時に同じワークフローを操作することを防ぎ、データ破損を回避します。

## アーキテクチャ

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

1. 現在のインスタンスIDと `ownerInstanceId` を比較
2. 一致 → 許可
3. 不一致 → オーナープロセスの生存確認
4. オーナー死亡 → 所有権取得可能
5. オーナー生存 → エラー

## 使用方法

### ulTaskIdパラメータ

委任ツールに `ulTaskId` を渡すと所有権チェックが有効になります：

```typescript
subagent_run({
  subagentId: "implementer",
  task: "Implement feature X",
  ulTaskId: "2026-02-25T18-44-58--edb94a81"  // 所有権チェック有効
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

**原因**: 別のpiインスタンスがワークフローを実行中

**対処**:
1. オーナープロセスが実行中か確認: `ps -p {pid}`
2. 実行中 → 完了まで待機
3. 終了済み → `ul_workflow_force_claim` で強制取得

### ul_workflow_not_owned

**原因**: 委任ツールが所有権なしでワークフローを操作しようとした

**対処**: `ulTaskId` パラメータを追加

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
- 二重ファイル書き込み（状態 + レジストリ）の原子性なし

## 関連ファイル

| ファイル | 説明 |
|---------|------|
| `.pi/extensions/ul-workflow.ts` | 所有権コア関数 |
| `.pi/extensions/subagents.ts` | checkUlWorkflowOwnership関数 |
| `.pi/tests/ownership.test.ts` | 所有権システムのテスト |
