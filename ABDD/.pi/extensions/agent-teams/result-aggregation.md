---
title: result-aggregation
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# result-aggregation

## 概要

`result-aggregation` モジュールのAPIリファレンス。

## インポート

```typescript
// from '../../lib/error-utils.js': toErrorMessage, extractStatusCodeFromMessage, classifyPressureError, ...
// from '../../lib/agent-types.js': RunOutcomeCode, RunOutcomeSignal
// from './storage': TeamMemberResult, TeamRunRecord, TeamDefinition, ...
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `isRetryableTeamMemberError` | リトライ可能か判定 |
| 関数 | `resolveTeamFailureOutcome` | 失敗時の結果生成 |
| 関数 | `resolveTeamMemberAggregateOutcome` | メンバー結果の統合判定 |
| 関数 | `resolveTeamParallelRunOutcome` | 並列実行結果の判定 |
| 関数 | `buildTeamResultText` | チーム結果のテキスト構築 |
| 関数 | `extractSummary` | 要約を抽出 |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[result-aggregation]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    error_utils["error-utils"]
    agent_types["agent-types"]
    storage["storage"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  buildTeamResultText["buildTeamResultText()"]
  extractSummary["extractSummary()"]
  isRetryableTeamMemberError["isRetryableTeamMemberError()"]
  resolveTeamFailureOutcome["resolveTeamFailureOutcome()"]
  resolveTeamMemberAggregateOutcome["resolveTeamMemberAggregateOutcome()"]
  resolveTeamParallelRunOutcome["resolveTeamParallelRunOutcome()"]
  resolveTeamFailureOutcome --> isRetryableTeamMemberError
  resolveTeamMemberAggregateOutcome --> resolveTeamFailureOutcome
  resolveTeamParallelRunOutcome --> resolveTeamFailureOutcome
  resolveTeamParallelRunOutcome --> resolveTeamMemberAggregateOutcome
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant result_aggregation as "result-aggregation"
  participant error_utils as "error-utils"
  participant agent_types as "agent-types"

  Caller->>result_aggregation: isRetryableTeamMemberError()
  result_aggregation->>error_utils: 内部関数呼び出し
  error_utils-->>result_aggregation: 結果
  result_aggregation-->>Caller: boolean

  Caller->>result_aggregation: resolveTeamFailureOutcome()
  result_aggregation-->>Caller: RunOutcomeSignal
```

## 関数

### isRetryableTeamMemberError

```typescript
isRetryableTeamMemberError(error: unknown, statusCode?: number): boolean
```

リトライ可能か判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |
| statusCode | `number` | いいえ |

**戻り値**: `boolean`

### resolveTeamFailureOutcome

```typescript
resolveTeamFailureOutcome(error: unknown): RunOutcomeSignal
```

失敗時の結果生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `RunOutcomeSignal`

### resolveTeamMemberAggregateOutcome

```typescript
resolveTeamMemberAggregateOutcome(memberResults: TeamMemberResult[]): RunOutcomeSignal & {
  failedMemberIds: string[];
}
```

メンバー結果の統合判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| memberResults | `TeamMemberResult[]` | はい |

**戻り値**: `RunOutcomeSignal & {
  failedMemberIds: string[];
}`

### resolveTeamParallelRunOutcome

```typescript
resolveTeamParallelRunOutcome(results: Array<{
    team: TeamDefinition;
    runRecord: TeamRunRecord;
    memberResults: TeamMemberResult[];
  }>): RunOutcomeSignal & {
  failedTeamIds: string[];
  partialTeamIds: string[];
  failedMemberIdsByTeam: Record<string, string[]>;
}
```

並列実行結果の判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `Array<{
    team: TeamDefinition;
    runRecord...` | はい |

**戻り値**: `RunOutcomeSignal & {
  failedTeamIds: string[];
  partialTeamIds: string[];
  failedMemberIdsByTeam: Record<string, string[]>;
}`

### buildTeamResultText

```typescript
buildTeamResultText(input: {
  run: TeamRunRecord;
  team: TeamDefinition;
  memberResults: TeamMemberResult[];
  communicationAudit?: TeamCommunicationAuditEntry[];
}): string
```

チーム結果のテキスト構築

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ run | `TeamRunRecord` | はい |
| &nbsp;&nbsp;↳ team | `TeamDefinition` | はい |
| &nbsp;&nbsp;↳ memberResults | `TeamMemberResult[]` | はい |
| &nbsp;&nbsp;↳ communicationAudit | `TeamCommunicationAuditEntry[]` | いいえ |

**戻り値**: `string`

### extractSummary

```typescript
extractSummary(output: string): string
```

要約を抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `string`

---
*自動生成: 2026-02-18T15:54:40.934Z*
