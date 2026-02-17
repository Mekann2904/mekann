---
title: Output Schema
category: reference
audience: developer
last_updated: 2026-02-18
tags: [schema, validation, json-schema, feature-flag]
related: [output-validation, text-parsing]
---

# Output Schema

構造化出力スキーマ定義と検証。サブエージェントとチームメンバー出力のためのJSON Schemaライクな検証を提供。

## 概要

フィーチャーフラグ `PI_OUTPUT_SCHEMA_MODE` による移行パスを提供：
- `legacy`: 正規表現ベースの検証のみ
- `dual`: 正規表現とスキーマ検証の両方を実行し、差異をログ出力
- `strict`: スキーマ検証のみ（デフォルト）

## 型定義

### SchemaValidationMode

検証モード。

```typescript
type SchemaValidationMode = "legacy" | "dual" | "strict";
```

### CommunicationIdMode

構造化出力処理用のコミュニケーションIDモード。

```typescript
type CommunicationIdMode = "legacy" | "structured";
```

### StanceClassificationMode

議論分析用のスタンス分類モード。

```typescript
type StanceClassificationMode = "disabled" | "heuristic" | "structured";
```

### SchemaValidationResult

スキーマ検証結果。

```typescript
interface SchemaValidationResult {
  ok: boolean;
  reason?: string;
  violations: SchemaViolation[];
  fallbackUsed: boolean;
  parsed?: ParsedStructuredOutput;
}
```

### SchemaViolation

個別のスキーマ違反。

```typescript
interface SchemaViolation {
  field: string;
  violationType: "missing" | "too_short" | "too_long" | "pattern_mismatch" | "out_of_range" | "invalid_type";
  expected: string;
  actual?: string;
}
```

### ParsedStructuredOutput

パース済み構造化出力。

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

## スキーマ定義

### サブエージェント出力スキーマ

```typescript
const SUBAGENT_OUTPUT_SCHEMA = {
  SUMMARY: { type: "string", required: true, minLength: 10, maxLength: 500 },
  RESULT: { type: "string", required: true, minLength: 20, maxLength: 10000 },
  NEXT_STEP: { type: "string", required: false, maxLength: 500 }
};
```

### チームメンバー出力スキーマ

```typescript
const TEAM_MEMBER_OUTPUT_SCHEMA = {
  SUMMARY: { type: "string", required: true, minLength: 10, maxLength: 300 },
  CLAIM: { type: "string", required: true, minLength: 10, maxLength: 500 },
  EVIDENCE: { type: "string", required: true, minLength: 5, maxLength: 2000 },
  DISCUSSION: { type: "string", required: false, maxLength: 3000 },
  RESULT: { type: "string", required: true, minLength: 20, maxLength: 10000 },
  NEXT_STEP: { type: "string", required: true, maxLength: 500 }
};
```

## 関数

### getSchemaValidationMode()

現在のスキーマ検証モードを取得する。

```typescript
function getSchemaValidationMode(): SchemaValidationMode
```

**環境変数:** `PI_OUTPUT_SCHEMA_MODE`
**デフォルト:** `strict`（v2.0.0+ 移行完了）

### resetSchemaValidationModeCache()

キャッシュされたスキーマ検証モードをリセットする（テスト用）。

```typescript
function resetSchemaValidationModeCache(): void
```

### setSchemaValidationMode(mode)

実行時にスキーマ検証モードを設定する（テスト用）。

```typescript
function setSchemaValidationMode(mode: SchemaValidationMode): void
```

### getCommunicationIdMode()

現在のコミュニケーションIDモードを取得する。

```typescript
function getCommunicationIdMode(): CommunicationIdMode
```

**環境変数:** `PI_COMMUNICATION_ID_MODE`
**デフォルト:** `legacy`

### getStanceClassificationMode()

現在のスタンス分類モードを取得する。

```typescript
function getStanceClassificationMode(): StanceClassificationMode
```

**環境変数:** `PI_STANCE_CLASSIFICATION_MODE`
**デフォルト:** `disabled`

### parseStructuredOutput(output)

構造化出力テキストを構造化オブジェクトにパースする。

```typescript
function parseStructuredOutput(output: string): ParsedStructuredOutput
```

### validateSubagentOutputWithSchema(output, mode)

スキーマでサブエージェント出力を検証する。

```typescript
function validateSubagentOutputWithSchema(
  output: string,
  mode?: SchemaValidationMode
): SchemaValidationResult
```

### validateTeamMemberOutputWithSchema(output, mode)

スキーマでチームメンバー出力を検証する。

```typescript
function validateTeamMemberOutputWithSchema(
  output: string,
  mode?: SchemaValidationMode
): SchemaValidationResult
```

## 違反追跡

### recordSchemaViolation(violation)

分析用にスキーマ違反を記録する。

```typescript
function recordSchemaViolation(violation: SchemaViolation): void
```

### getSchemaViolationStats()

スキーマ違反統計を取得する。

```typescript
function getSchemaViolationStats(): Map<string, number>
```

### resetSchemaViolationStats()

スキーマ違反統計をリセットする。

```typescript
function resetSchemaViolationStats(): void
```

## エクスポート

```typescript
export const SCHEMAS = {
  subagent: SUBAGENT_OUTPUT_SCHEMA,
  teamMember: TEAM_MEMBER_OUTPUT_SCHEMA
};
```

## 使用例

```typescript
import {
  getSchemaValidationMode,
  parseStructuredOutput,
  validateSubagentOutputWithSchema,
  recordSchemaViolation
} from "./output-schema.js";

// 現在のモード確認
const mode = getSchemaValidationMode();
console.log(`Validation mode: ${mode}`);

// 出力パース
const parsed = parseStructuredOutput(output);
console.log(`Summary: ${parsed.SUMMARY}`);

// サブエージェント出力検証
const result = validateSubagentOutputWithSchema(output);
if (!result.ok) {
  for (const violation of result.violations) {
    recordSchemaViolation(violation);
    console.error(`${violation.field}: ${violation.violationType}`);
  }
}
```

## 関連ファイル

- `./output-validation.ts` - 出力検証ユーティリティ
- `./text-parsing.ts` - テキストパーシングユーティリティ
