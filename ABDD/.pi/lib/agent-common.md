---
title: agent-common
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# agent-common

## 概要

`agent-common` モジュールのAPIリファレンス。

## インポート

```typescript
// from './validation-utils.js': toFiniteNumberWithDefault
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `pickFieldCandidate` | フィールド候補を選択 |
| 関数 | `pickSummaryCandidate` | 概要候補を選択 |
| 関数 | `pickClaimCandidate` | CLAIM候補を選択 |
| 関数 | `normalizeEntityOutput` | エンティティ出力を正規化 |
| 関数 | `isEmptyOutputFailureMessage` | 空出力による失敗か判定 |
| 関数 | `buildFailureSummary` | 失敗要約メッセージを構築 |
| 関数 | `resolveTimeoutWithEnv` | タイムアウト値を環境変数から取得 |
| インターフェース | `EntityConfig` | エンティティ設定を定義 |
| インターフェース | `NormalizedEntityOutput` | 正規化エンティティ出力 |
| インターフェース | `PickFieldCandidateOptions` | フィールド候補オプション |
| インターフェース | `NormalizeEntityOutputOptions` | 正規化オプション定義 |
| 型 | `EntityType` | エンティティの種別 |

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
  buildFailureSummary["buildFailureSummary()"]
  isEmptyOutputFailureMessage["isEmptyOutputFailureMessage()"]
  normalizeEntityOutput["normalizeEntityOutput()"]
  pickClaimCandidate["pickClaimCandidate()"]
  pickFieldCandidate["pickFieldCandidate()"]
  pickSummaryCandidate["pickSummaryCandidate()"]
  resolveTimeoutWithEnv["resolveTimeoutWithEnv()"]
  normalizeEntityOutput --> pickClaimCandidate
  pickClaimCandidate --> pickFieldCandidate
  pickSummaryCandidate --> pickFieldCandidate
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

フィールド候補を選択

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

概要候補を選択

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `string`

### pickClaimCandidate

```typescript
pickClaimCandidate(text: string): string
```

CLAIM候補を選択

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `string`

### normalizeEntityOutput

```typescript
normalizeEntityOutput(output: string, options: NormalizeEntityOutputOptions): NormalizedEntityOutput
```

エンティティ出力を正規化

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

空出力による失敗か判定

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

失敗要約メッセージを構築

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| message | `string` | はい |

**戻り値**: `string`

### resolveTimeoutWithEnv

```typescript
resolveTimeoutWithEnv(defaultMs: number, envKey: string): number
```

タイムアウト値を環境変数から取得

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

エンティティ設定を定義

### NormalizedEntityOutput

```typescript
interface NormalizedEntityOutput {
  ok: boolean;
  output: string;
  degraded: boolean;
  reason?: string;
}
```

正規化エンティティ出力

### PickFieldCandidateOptions

```typescript
interface PickFieldCandidateOptions {
  maxLength: number;
  excludeLabels?: string[];
  fallback?: string;
}
```

フィールド候補オプション

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

正規化オプション定義

## 型定義

### EntityType

```typescript
type EntityType = "subagent" | "team-member"
```

エンティティの種別

---
*自動生成: 2026-02-23T06:29:42.252Z*
