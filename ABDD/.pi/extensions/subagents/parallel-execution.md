---
title: parallel-execution
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# parallel-execution

## 概要

`parallel-execution` モジュールのAPIリファレンス。

## インポート

```typescript
import { reserveRuntimeCapacity, tryReserveRuntimeCapacity, RuntimeCapacityReservationLease } from '../agent-runtime';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `resolveSubagentParallelCapacity` | - |
| インターフェース | `SubagentParallelCapacityResolution` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class SubagentParallelCapacityResolution {
    <<interface>>
    +allowed: boolean
    +requestedParallelism: number
    +appliedParallelism: number
    +reduced: boolean
    +reasons: string[]
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[parallel-execution]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    agent_runtime[agent-runtime]
  end
  main --> local
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant parallel_execution as parallel-execution
  participant agent_runtime as agent-runtime

  Caller->>parallel_execution: resolveSubagentParallelCapacity()
  activate parallel_execution
  Note over parallel_execution: 非同期処理開始
  parallel_execution->>agent_runtime: 内部関数呼び出し
  agent_runtime-->>parallel_execution: 結果
  deactivate parallel_execution
  parallel_execution-->>Caller: Promise<SubagentParallelCapacityResolution>
```

## 関数

### resolveSubagentParallelCapacity

```typescript
async resolveSubagentParallelCapacity(input: {
  requestedParallelism: number;
  additionalRequests: number;
  maxWaitMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
}): Promise<SubagentParallelCapacityResolution>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `{
  requestedParallelism: number;
  additionalRequests: number;
  maxWaitMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
}` | はい |

**戻り値**: `Promise<SubagentParallelCapacityResolution>`

## インターフェース

### SubagentParallelCapacityResolution

```typescript
interface SubagentParallelCapacityResolution {
  allowed: boolean;
  requestedParallelism: number;
  appliedParallelism: number;
  reduced: boolean;
  reasons: string[];
  waitedMs: number;
  timedOut: boolean;
  aborted: boolean;
  attempts: number;
  projectedRequests: number;
  projectedLlm: number;
  reservation?: RuntimeCapacityReservationLease;
}
```

---
*自動生成: 2026-02-17T22:16:16.580Z*
