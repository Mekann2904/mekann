---
title: parallel-execution
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# parallel-execution

## 概要

`parallel-execution` モジュールのAPIリファレンス。

## インポート

```typescript
// from '../agent-runtime': reserveRuntimeCapacity, tryReserveRuntimeCapacity, RuntimeCapacityReservationLease
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `buildMemberParallelCandidates` | メンバーの候補を作成 |
| 関数 | `buildTeamAndMemberParallelCandidates` | チームとメンバーの候補を作成 |
| 関数 | `resolveTeamParallelCapacity` | チーム並列容量を解決する |
| インターフェース | `TeamParallelCapacityCandidate` | チーム並列容量の候補 |
| インターフェース | `TeamParallelCapacityResolution` | チーム並列容量の解決結果 |

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
    agent_runtime["agent-runtime"]
  end
  main --> local
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant parallel_execution as "parallel-execution"
  participant agent_runtime as "agent-runtime"

  Caller->>parallel_execution: buildMemberParallelCandidates()
  parallel_execution->>agent_runtime: 内部関数呼び出し
  agent_runtime-->>parallel_execution: 結果
  parallel_execution-->>Caller: TeamParallelCapacity

  Caller->>parallel_execution: buildTeamAndMemberParallelCandidates()
  parallel_execution-->>Caller: TeamParallelCapacity
```

## 関数

### buildMemberParallelCandidates

```typescript
buildMemberParallelCandidates(memberParallelism: number): TeamParallelCapacityCandidate[]
```

メンバーの候補を作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| memberParallelism | `number` | はい |

**戻り値**: `TeamParallelCapacityCandidate[]`

### buildTeamAndMemberParallelCandidates

```typescript
buildTeamAndMemberParallelCandidates(teamParallelism: number, memberParallelism: number): TeamParallelCapacityCandidate[]
```

チームとメンバーの候補を作成

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

チーム並列容量を解決する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ requestedTeamParallelism | `number` | はい |
| &nbsp;&nbsp;↳ requestedMemberParallelism | `number` | はい |
| &nbsp;&nbsp;↳ candidates | `TeamParallelCapacityCandidate[]` | はい |
| &nbsp;&nbsp;↳ toolName | `string` | いいえ |
| &nbsp;&nbsp;↳ maxWaitMs | `number` | はい |
| &nbsp;&nbsp;↳ pollIntervalMs | `number` | はい |
| &nbsp;&nbsp;↳ signal | `AbortSignal` | いいえ |

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

チーム並列容量の候補

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

チーム並列容量の解決結果

---
*自動生成: 2026-02-18T15:54:40.931Z*
