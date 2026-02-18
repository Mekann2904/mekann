---
title: agent-common
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# agent-common

## 概要

`agent-common` モジュールのAPIリファレンス。

## インポート

```typescript
import { toFiniteNumberWithDefault } from './validation-utils.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `pickFieldCandidate` | Pick a candidate text for a structured field from  |
| 関数 | `pickSummaryCandidate` | Pick candidate text for SUMMARY field. |
| 関数 | `pickClaimCandidate` | Pick candidate text for CLAIM field. |
| 関数 | `normalizeEntityOutput` | Normalize entity output to required structured for |
| 関数 | `isEmptyOutputFailureMessage` | Check if error message indicates empty output fail |
| 関数 | `buildFailureSummary` | Build a human-readable failure summary from error  |
| 関数 | `resolveTimeoutWithEnv` | Resolve timeout with environment variable override |
| インターフェース | `EntityConfig` | Configuration for entity-specific behavior. |
| インターフェース | `NormalizedEntityOutput` | Result of normalizing entity output to required fo |
| インターフェース | `PickFieldCandidateOptions` | Options for pickFieldCandidate function. |
| インターフェース | `NormalizeEntityOutputOptions` | Options for normalizeEntityOutput function. |
| 型 | `EntityType` | Entity type identifier for shared functions. |

## 図解

### クラス図

```mermaid
classDiagram
  class EntityConfig {
    <<interface>>
    +type: EntityType
    +label: string
    +emptyOutputMessage: string
    +defaultSummaryFallback: string
  }
  class NormalizedEntityOutput {
    <<interface>>
    +ok: boolean
    +output: string
    +degraded: boolean
    +reason: string
  }
  class PickFieldCandidateOptions {
    <<interface>>
    +maxLength: number
    +excludeLabels: string
    +fallback: string
  }
  class NormalizeEntityOutputOptions {
    <<interface>>
    +config: EntityConfig
    +validateFn: output_string_ok
    +requiredLabels: string
    +pickSummary: text_string_strin
    +includeConfidence: boolean
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[agent-common]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    validation_utils["validation-utils"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  pickFieldCandidate["pickFieldCandidate()"]
  pickSummaryCandidate["pickSummaryCandidate()"]
  pickClaimCandidate["pickClaimCandidate()"]
  normalizeEntityOutput["normalizeEntityOutput()"]
  isEmptyOutputFailureMessage["isEmptyOutputFailureMessage()"]
  buildFailureSummary["buildFailureSummary()"]
  pickFieldCandidate -.-> pickSummaryCandidate
  pickSummaryCandidate -.-> pickClaimCandidate
  pickClaimCandidate -.-> normalizeEntityOutput
  normalizeEntityOutput -.-> isEmptyOutputFailureMessage
  isEmptyOutputFailureMessage -.-> buildFailureSummary
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant agent_common as "agent-common"
  participant validation_utils as "validation-utils"

  Caller->>agent_common: pickFieldCandidate()
  agent_common->>validation_utils: 内部関数呼び出し
  validation_utils-->>agent_common: 結果
  agent_common-->>Caller: string

  Caller->>agent_common: pickSummaryCandidate()
  agent_common-->>Caller: string
```

## 関数

### pickFieldCandidate

```typescript
pickFieldCandidate(text: string, options: PickFieldCandidateOptions): string
```

Pick a candidate text for a structured field from unstructured output.
Used to extract SUMMARY, CLAIM, or other field values when output
doesn't conform to expected format.

Algorithm:
1. Split text into non-empty lines
2. Find first line that doesn't start with excluded labels
3. Clean markdown formatting and extra whitespace
4. Truncate to maxLength with ellipsis if needed

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| options | `PickFieldCandidateOptions` | はい |

**戻り値**: `string`

### pickSummaryCandidate

```typescript
pickSummaryCandidate(text: string): string
```

Pick candidate text for SUMMARY field.
Convenience wrapper with subagent-specific defaults.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `string`

### pickClaimCandidate

```typescript
pickClaimCandidate(text: string): string
```

Pick candidate text for CLAIM field.
Convenience wrapper with team-member-specific defaults.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `string`

### normalizeEntityOutput

```typescript
normalizeEntityOutput(output: string, options: NormalizeEntityOutputOptions): NormalizedEntityOutput
```

Normalize entity output to required structured format.
When output doesn't conform to expected format, attempts to restructure
it while preserving the original content.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| options | `NormalizeEntityOutputOptions` | はい |

**戻り値**: `NormalizedEntityOutput`

### isEmptyOutputFailureMessage

```typescript
isEmptyOutputFailureMessage(message: string, config: EntityConfig): boolean
```

Check if error message indicates empty output failure.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| message | `string` | はい |
| config | `EntityConfig` | はい |

**戻り値**: `boolean`

### buildFailureSummary

```typescript
buildFailureSummary(message: string): string
```

Build a human-readable failure summary from error message.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| message | `string` | はい |

**戻り値**: `string`

### resolveTimeoutWithEnv

```typescript
resolveTimeoutWithEnv(defaultMs: number, envKey: string): number
```

Resolve timeout with environment variable override support.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| defaultMs | `number` | はい |
| envKey | `string` | はい |

**戻り値**: `number`

## インターフェース

### EntityConfig

```typescript
interface EntityConfig {
  type: EntityType;
  label: string;
  emptyOutputMessage: string;
  defaultSummaryFallback: string;
}
```

Configuration for entity-specific behavior.

### NormalizedEntityOutput

```typescript
interface NormalizedEntityOutput {
  ok: boolean;
  output: string;
  degraded: boolean;
  reason?: string;
}
```

Result of normalizing entity output to required format.

### PickFieldCandidateOptions

```typescript
interface PickFieldCandidateOptions {
  maxLength: number;
  excludeLabels?: string[];
  fallback?: string;
}
```

Options for pickFieldCandidate function.

### NormalizeEntityOutputOptions

```typescript
interface NormalizeEntityOutputOptions {
  config: EntityConfig;
  validateFn: (output: string) => { ok: boolean; reason?: string };
  requiredLabels: string[];
  pickSummary?: (text: string) => string;
  includeConfidence?: boolean;
  formatAdditionalFields?: (text: string) => string[];
}
```

Options for normalizeEntityOutput function.

## 型定義

### EntityType

```typescript
type EntityType = "subagent" | "team-member"
```

Entity type identifier for shared functions.
Used to distinguish between subagent and team member contexts.

---
*自動生成: 2026-02-18T00:15:35.642Z*
