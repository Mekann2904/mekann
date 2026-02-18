---
title: output-schema
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# output-schema

## 概要

`output-schema` モジュールのAPIリファレンス。

## インポート

```typescript
import { extractField, parseUnitInterval, clampConfidence } from './text-parsing.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getCommunicationIdMode` | 現在のコミュニケーションIDモードを取得 |
| 関数 | `resetCommunicationIdModeCache` | キャッシュされた通信IDモードをリセットする |
| 関数 | `setCommunicationIdMode` | 通信IDモードを設定する |
| 関数 | `getStanceClassificationMode` | 現在のスタンス分類モードを取得する。 |
| 関数 | `resetStanceClassificationModeCache` | キャッシュされたスタンス分類モードをリセットする |
| 関数 | `setStanceClassificationMode` | スタンス分類モードを設定する |
| 関数 | `getSchemaValidationMode` | 現在のスキーマ検証モードを取得する |
| 関数 | `resetSchemaValidationModeCache` | キャッシュされたスキーマ検証モードをリセットする。 |
| 関数 | `setSchemaValidationMode` | 実行時にスキーマ検証モードを設定する（主にテスト用）。 |
| 関数 | `parseStructuredOutput` | 構造化された出力テキストを解析する |
| 関数 | `validateSubagentOutputWithSchema` | サブエージェントの出力をスキーマ検証する |
| 関数 | `validateTeamMemberOutputWithSchema` | チームメンバー出力のスキーマ検証 |
| 関数 | `recordSchemaViolation` | スキーマ違反を記録する |
| 関数 | `getSchemaViolationStats` | スキーマ違反の統計情報を取得 |
| 関数 | `resetSchemaViolationStats` | スキーマ違反の統計情報をリセットする。 |
| インターフェース | `SchemaValidationResult` | スキーマ検証の結果を表します。 |
| インターフェース | `SchemaViolation` | 個別のスキーマ違反 |
| インターフェース | `ParsedStructuredOutput` | 構造化された出力データの解析結果 |
| 型 | `SchemaValidationMode` | 出力スキーマ検証モード |
| 型 | `CommunicationIdMode` | Communication ID mode for structured output proces |
| 型 | `StanceClassificationMode` | 態度分類モード |

## 図解

### クラス図

```mermaid
classDiagram
  class SchemaField {
    <<interface>>
    +required: boolean
    +minLength: number
    +maxLength: number
    +pattern: RegExp
    +min: number
  }
  class OutputSchema {
    <<interface>>
  }
  class SchemaValidationResult {
    <<interface>>
    +ok: boolean
    +reason: string
    +violations: SchemaViolation
    +fallbackUsed: boolean
    +parsed: ParsedStructuredOutp
  }
  class SchemaViolation {
    <<interface>>
    +field: string
    +violationType: missing_too_short
    +expected: string
    +actual: string
  }
  class ParsedStructuredOutput {
    <<interface>>
    +SUMMARY: string
    +CLAIM: string
    +EVIDENCE: string
    +CONFIDENCE: number
    +DISCUSSION: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[output-schema]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    text_parsing["text-parsing"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  getCommunicationIdMode["getCommunicationIdMode()"]
  resetCommunicationIdModeCache["resetCommunicationIdModeCache()"]
  setCommunicationIdMode["setCommunicationIdMode()"]
  getStanceClassificationMode["getStanceClassificationMode()"]
  resetStanceClassificationModeCache["resetStanceClassificationModeCache()"]
  setStanceClassificationMode["setStanceClassificationMode()"]
  getCommunicationIdMode -.-> resetCommunicationIdModeCache
  resetCommunicationIdModeCache -.-> setCommunicationIdMode
  setCommunicationIdMode -.-> getStanceClassificationMode
  getStanceClassificationMode -.-> resetStanceClassificationModeCache
  resetStanceClassificationModeCache -.-> setStanceClassificationMode
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant output_schema as "output-schema"
  participant text_parsing as "text-parsing"

  Caller->>output_schema: getCommunicationIdMode()
  output_schema->>text_parsing: 内部関数呼び出し
  text_parsing-->>output_schema: 結果
  output_schema-->>Caller: CommunicationIdMode

  Caller->>output_schema: resetCommunicationIdModeCache()
  output_schema-->>Caller: void
```

## 関数

### getCommunicationIdMode

```typescript
getCommunicationIdMode(): CommunicationIdMode
```

現在のコミュニケーションIDモードを取得

**戻り値**: `CommunicationIdMode`

### resetCommunicationIdModeCache

```typescript
resetCommunicationIdModeCache(): void
```

キャッシュされた通信IDモードをリセットする

**戻り値**: `void`

### setCommunicationIdMode

```typescript
setCommunicationIdMode(mode: CommunicationIdMode): void
```

通信IDモードを設定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| mode | `CommunicationIdMode` | はい |

**戻り値**: `void`

### getStanceClassificationMode

```typescript
getStanceClassificationMode(): StanceClassificationMode
```

現在のスタンス分類モードを取得する。

**戻り値**: `StanceClassificationMode`

### resetStanceClassificationModeCache

```typescript
resetStanceClassificationModeCache(): void
```

キャッシュされたスタンス分類モードをリセットする

**戻り値**: `void`

### setStanceClassificationMode

```typescript
setStanceClassificationMode(mode: StanceClassificationMode): void
```

スタンス分類モードを設定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| mode | `StanceClassificationMode` | はい |

**戻り値**: `void`

### getSchemaValidationMode

```typescript
getSchemaValidationMode(): SchemaValidationMode
```

現在のスキーマ検証モードを取得する

**戻り値**: `SchemaValidationMode`

### resetSchemaValidationModeCache

```typescript
resetSchemaValidationModeCache(): void
```

キャッシュされたスキーマ検証モードをリセットする。

**戻り値**: `void`

### setSchemaValidationMode

```typescript
setSchemaValidationMode(mode: SchemaValidationMode): void
```

実行時にスキーマ検証モードを設定する（主にテスト用）。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| mode | `SchemaValidationMode` | はい |

**戻り値**: `void`

### parseStructuredOutput

```typescript
parseStructuredOutput(output: string): ParsedStructuredOutput
```

構造化された出力テキストを解析する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `ParsedStructuredOutput`

### validateField

```typescript
validateField(fieldName: string, value: unknown, schema: SchemaField): SchemaViolation[]
```

Validate a single field against its schema definition.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| fieldName | `string` | はい |
| value | `unknown` | はい |
| schema | `SchemaField` | はい |

**戻り値**: `SchemaViolation[]`

### validateAgainstSchema

```typescript
validateAgainstSchema(parsed: ParsedStructuredOutput, schema: OutputSchema): SchemaViolation[]
```

Validate parsed output against a schema.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| parsed | `ParsedStructuredOutput` | はい |
| schema | `OutputSchema` | はい |

**戻り値**: `SchemaViolation[]`

### validateSubagentOutputWithSchema

```typescript
validateSubagentOutputWithSchema(output: string, mode: SchemaValidationMode): SchemaValidationResult
```

サブエージェントの出力をスキーマ検証する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| mode | `SchemaValidationMode` | はい |

**戻り値**: `SchemaValidationResult`

### validateTeamMemberOutputWithSchema

```typescript
validateTeamMemberOutputWithSchema(output: string, mode: SchemaValidationMode): SchemaValidationResult
```

チームメンバー出力のスキーマ検証

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| mode | `SchemaValidationMode` | はい |

**戻り値**: `SchemaValidationResult`

### recordSchemaViolation

```typescript
recordSchemaViolation(violation: SchemaViolation): void
```

スキーマ違反を記録する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| violation | `SchemaViolation` | はい |

**戻り値**: `void`

### getSchemaViolationStats

```typescript
getSchemaViolationStats(): Map<string, number>
```

スキーマ違反の統計情報を取得

**戻り値**: `Map<string, number>`

### resetSchemaViolationStats

```typescript
resetSchemaViolationStats(): void
```

スキーマ違反の統計情報をリセットする。

**戻り値**: `void`

## インターフェース

### SchemaField

```typescript
interface SchemaField {
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  min?: number;
  max?: number;
  type: "string" | "number" | "string[]";
}
```

Schema field definition.

### OutputSchema

```typescript
interface OutputSchema {
}
```

Schema definition for structured output.

### SchemaValidationResult

```typescript
interface SchemaValidationResult {
  ok: boolean;
  reason?: string;
  violations: SchemaViolation[];
  fallbackUsed: boolean;
  parsed?: ParsedStructuredOutput;
}
```

スキーマ検証の結果を表します。

### SchemaViolation

```typescript
interface SchemaViolation {
  field: string;
  violationType: "missing" | "too_short" | "too_long" | "pattern_mismatch" | "out_of_range" | "invalid_type";
  expected: string;
  actual?: string;
}
```

個別のスキーマ違反

### ParsedStructuredOutput

```typescript
interface ParsedStructuredOutput {
  SUMMARY: string;
  CLAIM?: string;
  EVIDENCE?: string;
  CONFIDENCE?: number;
  DISCUSSION?: string;
  RESULT: string;
  NEXT_STEP?: string;
}
```

構造化された出力データの解析結果

## 型定義

### SchemaValidationMode

```typescript
type SchemaValidationMode = "legacy" | "dual" | "strict"
```

出力スキーマ検証モード

### CommunicationIdMode

```typescript
type CommunicationIdMode = "legacy" | "structured"
```

Communication ID mode for structured output processing.
- "legacy" (default): No structured claim/evidence IDs
- "structured": Enable claim and evidence ID tracking

### StanceClassificationMode

```typescript
type StanceClassificationMode = "disabled" | "heuristic" | "structured"
```

態度分類モード

---
*自動生成: 2026-02-18T06:37:19.923Z*
