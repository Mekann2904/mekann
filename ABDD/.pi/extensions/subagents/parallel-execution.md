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
*自動生成: 2026-02-17T21:48:27.611Z*
