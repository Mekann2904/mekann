---
title: runtime-helpers
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# runtime-helpers

## 概要

`runtime-helpers` モジュールのAPIリファレンス。

## インポート

```typescript
import { getRuntimeSnapshot, RuntimeCapacityReservationLease } from '../agent-runtime.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `buildRuntimeLimitError` | 実行時制限エラーメッセージを生成する |
| 関数 | `buildRuntimeQueueWaitError` | オーケストレーションキュー待機のエラーメッセージを生成します。 |
| 関数 | `startReservationHeartbeat` | 予約を維持するハートビートを開始する |
| 関数 | `refreshRuntimeStatus` | ランタイムステータス表示を更新する |
| インターフェース | `RuntimeLimitErrorOptions` | 実行制限エラーのオプション。 |
| インターフェース | `RuntimeQueueWaitInfo` | キューエラーメッセージ構築用情報 |

## 図解

### クラス図

```mermaid
classDiagram
  class RuntimeLimitErrorOptions {
    <<interface>>
    +waitedMs: number
    +timedOut: boolean
  }
  class RuntimeQueueWaitInfo {
    <<interface>>
    +waitedMs: number
    +attempts: number
    +timedOut: boolean
    +aborted: boolean
    +queuePosition: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[runtime-helpers]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    agent_runtime["agent-runtime"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  buildRuntimeLimitError["buildRuntimeLimitError()"]
  buildRuntimeQueueWaitError["buildRuntimeQueueWaitError()"]
  startReservationHeartbeat["startReservationHeartbeat()"]
  refreshRuntimeStatus["refreshRuntimeStatus()"]
  buildRuntimeLimitError -.-> buildRuntimeQueueWaitError
  buildRuntimeQueueWaitError -.-> startReservationHeartbeat
  startReservationHeartbeat -.-> refreshRuntimeStatus
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant runtime_helpers as "runtime-helpers"
  participant agent_runtime as "agent-runtime"

  Caller->>runtime_helpers: buildRuntimeLimitError()
  runtime_helpers->>agent_runtime: 内部関数呼び出し
  agent_runtime-->>runtime_helpers: 結果
  runtime_helpers-->>Caller: string

  Caller->>runtime_helpers: buildRuntimeQueueWaitError()
  runtime_helpers-->>Caller: string
```

## 関数

### buildRuntimeLimitError

```typescript
buildRuntimeLimitError(toolName: string, reasons: string[], options?: RuntimeLimitErrorOptions): string
```

実行時制限エラーメッセージを生成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolName | `string` | はい |
| reasons | `string[]` | はい |
| options | `RuntimeLimitErrorOptions` | いいえ |

**戻り値**: `string`

### buildRuntimeQueueWaitError

```typescript
buildRuntimeQueueWaitError(toolName: string, queueWait: RuntimeQueueWaitInfo): string
```

オーケストレーションキュー待機のエラーメッセージを生成します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolName | `string` | はい |
| queueWait | `RuntimeQueueWaitInfo` | はい |

**戻り値**: `string`

### startReservationHeartbeat

```typescript
startReservationHeartbeat(reservation: RuntimeCapacityReservationLease): () => void
```

予約を維持するハートビートを開始する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| reservation | `RuntimeCapacityReservationLease` | はい |

**戻り値**: `() => void`

### refreshRuntimeStatus

```typescript
refreshRuntimeStatus(ctx: any, statusKey: "subagent-runtime" | "agent-team-runtime", primaryLabel: string, primaryActive: number, secondaryLabel: string, secondaryActive: number): void
```

ランタイムステータス表示を更新する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `any` | はい |
| statusKey | `"subagent-runtime" | "agent-team-runtime"` | はい |
| primaryLabel | `string` | はい |
| primaryActive | `number` | はい |
| secondaryLabel | `string` | はい |
| secondaryActive | `number` | はい |

**戻り値**: `void`

## インターフェース

### RuntimeLimitErrorOptions

```typescript
interface RuntimeLimitErrorOptions {
  waitedMs?: number;
  timedOut?: boolean;
}
```

実行制限エラーのオプション。

### RuntimeQueueWaitInfo

```typescript
interface RuntimeQueueWaitInfo {
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
  aborted: boolean;
  queuePosition: number;
  queuedAhead: number;
}
```

キューエラーメッセージ構築用情報

---
*自動生成: 2026-02-18T06:37:19.727Z*
