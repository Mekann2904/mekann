---
title: Output Validation
category: reference
audience: developer
last_updated: 2026-02-18
tags: [validation, output, subagent, team]
related: [output-schema, text-parsing]
---

# Output Validation

サブエージェントとチームメンバー出力のための出力検証ユーティリティ。構造化出力フォーマット準拠の一貫した検証を提供。

## 概要

スキーマ検証サポートで拡張されている。フィーチャーフラグ `PI_OUTPUT_SCHEMA_MODE` に従う。

## 型定義

### SubagentValidationOptions

サブエージェント出力の検証オプション。

```typescript
interface SubagentValidationOptions {
  minChars: number;
  requiredLabels: string[];
}
```

**デフォルト:**
```typescript
{
  minChars: 48,
  requiredLabels: ["SUMMARY:", "RESULT:", "NEXT_STEP:"]
}
```

### TeamMemberValidationOptions

チームメンバー出力の検証オプション。

```typescript
interface TeamMemberValidationOptions {
  minChars: number;
  requiredLabels: string[];
}
```

**デフォルト:**
```typescript
{
  minChars: 80,
  requiredLabels: ["SUMMARY:", "CLAIM:", "EVIDENCE:", "RESULT:", "NEXT_STEP:"]
}
```

### ExtendedValidationResult

スキーマ情報を含む拡張検証結果。

```typescript
interface ExtendedValidationResult {
  ok: boolean;
  reason?: string;
  mode: SchemaValidationMode;
  legacyOk: boolean;
  legacyReason?: string;
  schemaOk?: boolean;
  schemaReason?: string;
  schemaViolations?: SchemaViolation[];
  fallbackUsed: boolean;
}
```

## 関数

### hasNonEmptyResultSection(output)

出力が空でないRESULTセクションを持っているか確認する。

```typescript
function hasNonEmptyResultSection(output: string): boolean
```

**パラメータ:**
- `output` - 確認する出力テキスト

**戻り値:** RESULTセクションにコンテンツがある場合はtrue

**検出ロジック:**
1. `RESULT:` ラベルを検索
2. 同じ行にコンテンツがあるか確認
3. 次のラベルまでの後続行にコンテンツがあるか確認

### validateSubagentOutput(output, options)

サブエージェント出力のフォーマットとコンテンツを検証する。

```typescript
function validateSubagentOutput(
  output: string,
  options?: Partial<SubagentValidationOptions>
): { ok: boolean; reason?: string }
```

**検証内容:**
1. 空出力チェック
2. 最小文字数チェック
3. 必須ラベル存在チェック
4. 非空RESULTセクションチェック

**戻り値:**
- `ok: true` - 検証成功
- `ok: false, reason: "..."` - 検証失敗と理由

### validateTeamMemberOutput(output, options)

チームメンバー出力のフォーマットとコンテンツを検証する。サブエージェントより多くのラベルと長いコンテンツを必要とする。

```typescript
function validateTeamMemberOutput(
  output: string,
  options?: Partial<TeamMemberValidationOptions>
): { ok: boolean; reason?: string }
```

### validateSubagentOutputEnhanced(output, options)

拡張スキーマサポートでサブエージェント出力を検証する。PI_OUTPUT_SCHEMA_MODE フィーチャーフラグに従う。

```typescript
function validateSubagentOutputEnhanced(
  output: string,
  options?: Partial<SubagentValidationOptions>
): ExtendedValidationResult
```

**モード別動作:**
- `legacy`: レガシー検証のみ
- `strict`: スキーマ検証のみ
- `dual`: レガシー検証でパス/フェイル、スキーマ差異を報告

### validateTeamMemberOutputEnhanced(output, options)

拡張スキーマサポートでチームメンバー出力を検証する。PI_OUTPUT_SCHEMA_MODE フィーチャーフラグに従う。

```typescript
function validateTeamMemberOutputEnhanced(
  output: string,
  options?: Partial<TeamMemberValidationOptions>
): ExtendedValidationResult
```

## 使用例

```typescript
import {
  hasNonEmptyResultSection,
  validateSubagentOutput,
  validateTeamMemberOutput,
  validateSubagentOutputEnhanced
} from "./output-validation.js";

// 基本検証
const result = validateSubagentOutput(output);
if (!result.ok) {
  console.error(`Validation failed: ${result.reason}`);
}

// 拡張検証
const enhancedResult = validateSubagentOutputEnhanced(output);
if (enhancedResult.mode === "dual") {
  console.log(`Legacy: ${enhancedResult.legacyOk}`);
  console.log(`Schema: ${enhancedResult.schemaOk}`);
  if (enhancedResult.schemaViolations) {
    for (const v of enhancedResult.schemaViolations) {
      console.warn(`Violation: ${v.field} - ${v.violationType}`);
    }
  }
}

// チームメンバー検証
const teamResult = validateTeamMemberOutput(teamOutput, {
  minChars: 100,
  requiredLabels: ["SUMMARY:", "CLAIM:", "EVIDENCE:", "RESULT:", "NEXT_STEP:", "DISCUSSION:"]
});
```

## エラーメッセージ

| 理由 | 説明 |
|-----|------|
| `empty output` | 出力が空 |
| `too short (N chars)` | 最小文字数未満 |
| `missing labels: X, Y` | 必須ラベルが欠落 |
| `empty RESULT section` | RESULTセクションにコンテンツがない |

## 関連ファイル

- `./output-schema.ts` - スキーマ定義と検証
- `./text-parsing.ts` - テキストパーシング
