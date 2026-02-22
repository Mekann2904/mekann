---
title: output-template
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# output-template

## 概要

`output-template` モジュールのAPIリファレンス。

## インポート

```typescript
// from './output-schema.js': ParsedStructuredOutput, SchemaViolation, parseStructuredOutput
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `applyOutputTemplate` | 出力にテンプレートを適用し、デフォルト値で補完する |
| 関数 | `formatNormalizedOutput` | 正規化された出力を文字列形式に変換する |
| 関数 | `hasMinimumStructure` | 生の出力が最小限の構造を持っているかを確認する |
| インターフェース | `NormalizedOutput` | 正規化された出力構造 |
| インターフェース | `TemplateApplicationResult` | テンプレート適用結果 |

## 図解

### クラス図

```mermaid
classDiagram
  class NormalizedOutput {
    <<interface>>
    +SUMMARY: string
    +RESULT: string
    +NEXT_STEP: string
    +CONFIDENCE: number
  }
  class TemplateApplicationResult {
    <<interface>>
    +normalized: NormalizedOutput
    +filledFields: string
    +preservedFields: string
    +formatted: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[output-template]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    output_schema["output-schema"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  applyOutputTemplate["applyOutputTemplate()"]
  extractMissingFields["extractMissingFields()"]
  formatNormalizedOutput["formatNormalizedOutput()"]
  hasMinimumStructure["hasMinimumStructure()"]
  isEmptyValue["isEmptyValue()"]
  applyOutputTemplate --> extractMissingFields
  applyOutputTemplate --> formatNormalizedOutput
  applyOutputTemplate --> isEmptyValue
  hasMinimumStructure --> isEmptyValue
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant output_template as "output-template"
  participant output_schema as "output-schema"

  Caller->>output_template: applyOutputTemplate()
  output_template->>output_schema: 内部関数呼び出し
  output_schema-->>output_template: 結果
  output_template-->>Caller: TemplateApplicationR

  Caller->>output_template: formatNormalizedOutput()
  output_template-->>Caller: string
```

## 関数

### isEmptyValue

```typescript
isEmptyValue(value: unknown): boolean
```

フィールドが実質的に空かどうかを判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |

**戻り値**: `boolean`

### extractMissingFields

```typescript
extractMissingFields(violations: SchemaViolation[]): Set<string>
```

違反から欠落フィールド名を抽出する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| violations | `SchemaViolation[]` | はい |

**戻り値**: `Set<string>`

### applyOutputTemplate

```typescript
applyOutputTemplate(rawOutput: string, violations: SchemaViolation[]): TemplateApplicationResult
```

出力にテンプレートを適用し、デフォルト値で補完する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| rawOutput | `string` | はい |
| violations | `SchemaViolation[]` | はい |

**戻り値**: `TemplateApplicationResult`

### formatNormalizedOutput

```typescript
formatNormalizedOutput(output: NormalizedOutput): string
```

正規化された出力を文字列形式に変換する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `NormalizedOutput` | はい |

**戻り値**: `string`

### hasMinimumStructure

```typescript
hasMinimumStructure(rawOutput: string): boolean
```

生の出力が最小限の構造を持っているかを確認する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| rawOutput | `string` | はい |

**戻り値**: `boolean`

## インターフェース

### NormalizedOutput

```typescript
interface NormalizedOutput {
  SUMMARY: string;
  RESULT: string;
  NEXT_STEP: string;
  CONFIDENCE: number;
}
```

正規化された出力構造

### TemplateApplicationResult

```typescript
interface TemplateApplicationResult {
  normalized: NormalizedOutput;
  filledFields: string[];
  preservedFields: string[];
  formatted: string;
}
```

テンプレート適用結果

---
*自動生成: 2026-02-22T18:55:28.957Z*
