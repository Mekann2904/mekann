---
title: agent-teams
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# agent-teams

## 概要

`agent-teams` モジュールのAPIリファレンス。

## インポート

```typescript
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync... } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { Type } from '@mariozechner/pi-ai';
// ... and 38 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerAgentTeamsExtension` | エージェントチーム拡張を登録する |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[agent-teams]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    fs_utils["fs-utils"]
    format_utils["format-utils"]
    live_view_utils["live-view-utils"]
    tui_utils["tui-utils"]
    error_utils["error-utils"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant agent_teams as "agent-teams"
  participant mariozechner as "@mariozechner"
  participant fs_utils as "fs-utils"
  participant format_utils as "format-utils"

  Caller->>agent_teams: registerAgentTeamsExtension()
  agent_teams->>mariozechner: API呼び出し
  mariozechner-->>agent_teams: レスポンス
  agent_teams->>fs_utils: 内部関数呼び出し
  fs_utils-->>agent_teams: 結果
  agent_teams-->>Caller: void
```

## 関数

### shouldRetryFailedMemberResult

```typescript
shouldRetryFailedMemberResult(result: TeamMemberResult, retryRound: number): boolean
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `TeamMemberResult` | はい |
| retryRound | `number` | はい |

**戻り値**: `boolean`

### toRetryOverrides

```typescript
toRetryOverrides(value: unknown): RetryWithBackoffOverrides | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |

**戻り値**: `RetryWithBackoffOverrides | undefined`

### refreshRuntimeStatus

```typescript
refreshRuntimeStatus(ctx: any): void
```

Refresh runtime status display in the UI with agent-team-specific parameters.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `any` | はい |

**戻り値**: `void`

### formatTeamList

```typescript
formatTeamList(storage: TeamStorage): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `TeamStorage` | はい |

**戻り値**: `string`

### formatRecentRuns

```typescript
formatRecentRuns(storage: TeamStorage, limit: any): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `TeamStorage` | はい |
| limit | `any` | はい |

**戻り値**: `string`

### runPiPrintMode

```typescript
async runPiPrintMode(input: {
  provider?: string;
  model?: string;
  prompt: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onStderrChunk?: (chunk: string) => void;
}): Promise<PrintCommandResult>
```

Run pi-print mode for team member execution.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ provider | `string` | いいえ |
| &nbsp;&nbsp;↳ model | `string` | いいえ |
| &nbsp;&nbsp;↳ prompt | `string` | はい |
| &nbsp;&nbsp;↳ timeoutMs | `number` | はい |
| &nbsp;&nbsp;↳ signal | `AbortSignal` | いいえ |
| &nbsp;&nbsp;↳ onTextDelta | `(delta: string) => void;  onStderrChunk?: (chunk: string) => void;` | いいえ |

**戻り値**: `Promise<PrintCommandResult>`

### pickTeam

```typescript
pickTeam(storage: TeamStorage, requestedId?: string): TeamDefinition | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `TeamStorage` | はい |
| requestedId | `string` | いいえ |

**戻り値**: `TeamDefinition | undefined`

### pickDefaultParallelTeams

```typescript
pickDefaultParallelTeams(storage: TeamStorage): TeamDefinition[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `TeamStorage` | はい |

**戻り値**: `TeamDefinition[]`

### runTeamTask

```typescript
async runTeamTask(input: {
  team: TeamDefinition;
  task: string;
  strategy: TeamStrategy;
  memberParallelLimit?: number;
  communicationRounds: number;
  failedMemberRetryRounds?: number;
  communicationLinks?: Map<string, string[]>;
  sharedContext?: string;
  timeoutMs: number;
  cwd: string;
  retryOverrides?: RetryWithBackoffOverrides;
  fallbackProvider?: string;
  fallbackModel?: string;
  signal?: AbortSignal;
  onMemberStart?: (member: TeamMember) => void;
  onMemberEnd?: (member: TeamMember) => void;
  onMemberTextDelta?: (member: TeamMember, delta: string) => void;
  onMemberStderrChunk?: (member: TeamMember, chunk: string) => void;
  onMemberResult?: (member: TeamMember, result: TeamMemberResult) => void;
  onMemberPhase?: (member: TeamMember, phase: TeamLivePhase, round?: number) => void;
  onMemberEvent?: (member: TeamMember, event: string) => void;
  onTeamEvent?: (event: string) => void;
}): Promise<{ runRecord: TeamRunRecord; memberResults: TeamMemberResult[]; communicationAudit: TeamCommunicationAuditEntry[] }>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ team | `TeamDefinition` | はい |
| &nbsp;&nbsp;↳ task | `string` | はい |
| &nbsp;&nbsp;↳ strategy | `TeamStrategy` | はい |
| &nbsp;&nbsp;↳ memberParallelLimit | `number` | いいえ |
| &nbsp;&nbsp;↳ communicationRounds | `number` | はい |
| &nbsp;&nbsp;↳ failedMemberRetryRounds | `number` | いいえ |
| &nbsp;&nbsp;↳ communicationLinks | `Map<string, string[]>` | いいえ |
| &nbsp;&nbsp;↳ sharedContext | `string` | いいえ |
| &nbsp;&nbsp;↳ timeoutMs | `number` | はい |
| &nbsp;&nbsp;↳ cwd | `string` | はい |
| &nbsp;&nbsp;↳ retryOverrides | `RetryWithBackoffOverrides` | いいえ |
| &nbsp;&nbsp;↳ fallbackProvider | `string` | いいえ |
| &nbsp;&nbsp;↳ fallbackModel | `string` | いいえ |
| &nbsp;&nbsp;↳ signal | `AbortSignal` | いいえ |
| &nbsp;&nbsp;↳ onMemberStart | `(member: TeamMember) => void;  onMemberEnd?: (member: TeamMember) => void;  onMemberTextDelta?: (member: TeamMember, delta: string) => void;  onMemberStderrChunk?: (member: TeamMember, chunk: string) => void;  onMemberResult?: (member: TeamMember, result: TeamMemberResult) => void;  onMemberPhase?: (member: TeamMember, phase: TeamLivePhase, round?: number) => void;  onMemberEvent?: (member: TeamMember, event: string) => void;  onTeamEvent?: (event: string) => void;` | いいえ |

**戻り値**: `Promise<{ runRecord: TeamRunRecord; memberResults: TeamMemberResult[]; communicationAudit: TeamCommunicationAuditEntry[] }>`

### emitResultEvent

```typescript
emitResultEvent(member: TeamMember, phaseLabel: string, result: TeamMemberResult): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| member | `TeamMember` | はい |
| phaseLabel | `string` | はい |
| result | `TeamMemberResult` | はい |

**戻り値**: `void`

### runRetryMember

```typescript
async runRetryMember(member: TeamMember): Promise<TeamMemberResult>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| member | `TeamMember` | はい |

**戻り値**: `Promise<TeamMemberResult>`

### registerAgentTeamsExtension

```typescript
registerAgentTeamsExtension(pi: ExtensionAPI): void
```

エージェントチーム拡張を登録する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

### onMemberStart

```typescript
onMemberStart(member: TeamMember): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| member | `TeamMember` | はい |

**戻り値**: `void`

### onMemberEnd

```typescript
onMemberEnd(member: TeamMember): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| member | `TeamMember` | はい |

**戻り値**: `void`

### onRuntimeMemberStart

```typescript
onRuntimeMemberStart(): void
```

**戻り値**: `void`

### onRuntimeMemberEnd

```typescript
onRuntimeMemberEnd(): void
```

**戻り値**: `void`

## 型定義

### LiveViewMode

```typescript
type LiveViewMode = TeamLiveViewMode
```

---
*自動生成: 2026-02-18T07:17:30.173Z*
