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
| 関数 | `buildMemberParallelCandidates` | - |
| 関数 | `buildTeamAndMemberParallelCandidates` | - |
| 関数 | `resolveTeamParallelCapacity` | - |
| インターフェース | `TeamParallelCapacityCandidate` | - |
| インターフェース | `TeamParallelCapacityResolution` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class TeamParallelCapacityCandidate {
    <<interface>>
    +teamParallelism: number
    +memberParallelism: number
    +additionalRequests: number
    +additionalLlm: number
  }
  class TeamParallelCapacityResolution {
    <<interface>>
    +allowed: boolean
    +requestedTeamParallelism: number
    +requestedMemberParallelism: number
    +appliedTeamParallelism: number
    +appliedMemberParallelism: number
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

### 関数フロー

```mermaid
flowchart TD
  buildMemberParallelCandidates["buildMemberParallelCandidates()"]
  buildTeamAndMemberParallelCandidates["buildTeamAndMemberParallelCandidates()"]
  resolveTeamParallelCapacity["resolveTeamParallelCapacity()"]
  buildMemberParallelCandidates -.-> buildTeamAndMemberParallelCandidates
  buildTeamAndMemberParallelCandidates -.-> resolveTeamParallelCapacity
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant parallel_execution as parallel-execution
  participant agent_runtime as agent-runtime

  Caller->>parallel_execution: buildMemberParallelCandidates()
  parallel_execution->>agent_runtime: 内部関数呼び出し
  agent_runtime-->>parallel_execution: 結果
  parallel_execution-->>Caller: TeamParallelCapacityCandidate[]

  Caller->>parallel_execution: buildTeamAndMemberParallelCandidates()
  parallel_execution-->>Caller: TeamParallelCapacityCandidate[]
```

## 関数

### buildMemberParallelCandidates

```typescript
buildMemberParallelCandidates(memberParallelism: number): TeamParallelCapacityCandidate[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| memberParallelism | `number` | はい |

**戻り値**: `TeamParallelCapacityCandidate[]`

### buildTeamAndMemberParallelCandidates

```typescript
buildTeamAndMemberParallelCandidates(teamParallelism: number, memberParallelism: number): TeamParallelCapacityCandidate[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| teamParallelism | `number` | はい |
| memberParallelism | `number` | はい |

**戻り値**: `TeamParallelCapacityCandidate[]`

### resolveTeamParallelCapacity

```typescript
async resolveTeamParallelCapacity(input: {
  requestedTeamParallelism: number;
  requestedMemberParallelism: number;
  candidates: TeamParallelCapacityCandidate[];
  toolName?: string;
  maxWaitMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
}): Promise<TeamParallelCapacityResolution>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `{
  requestedTeamParallelism: number;
  requestedMemberParallelism: number;
  candidates: TeamParallelCapacityCandidate[];
  toolName?: string;
  maxWaitMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
}` | はい |

**戻り値**: `Promise<TeamParallelCapacityResolution>`

## インターフェース

### TeamParallelCapacityCandidate

```typescript
interface TeamParallelCapacityCandidate {
  teamParallelism: number;
  memberParallelism: number;
  additionalRequests: number;
  additionalLlm: number;
}
```

### TeamParallelCapacityResolution

```typescript
interface TeamParallelCapacityResolution {
  allowed: boolean;
  requestedTeamParallelism: number;
  requestedMemberParallelism: number;
  appliedTeamParallelism: number;
  appliedMemberParallelism: number;
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
*自動生成: 2026-02-17T21:54:59.608Z*
