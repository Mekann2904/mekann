---
title: text-parsing
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# text-parsing

## 概要

`text-parsing` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `clampConfidence` | 信頼度を0から1の範囲に丸める |
| 関数 | `generateClaimId` | Generate a unique claim ID for structured communic |
| 関数 | `generateEvidenceId` | 構造化された通信追跡用の証拠IDを生成する |
| 関数 | `parseUnitInterval` | 文字列から単位区間の値をパースする。 |
| 関数 | `extractField` | Extract a named field from structured output text. |
| 関数 | `extractMultilineField` | 指定されたフィールドの複数行を抽出する。 |
| 関数 | `countKeywordSignals` | 出力テキストに含まれるキーワードの数をカウントする |
| 関数 | `analyzeDiscussionStance` | 対象メンバーに関する議論のスタンスを分析する |
| 関数 | `extractConsensusMarker` | テキストから合意マーカーを抽出する |
| インターフェース | `DiscussionStanceResult` | ディスカッションのスタンス分析結果 |
| 型 | `DiscussionStance` | ディスカッションの立場を表す型 |

## 図解

### クラス図

```mermaid
classDiagram
  class DiscussionStanceResult {
    <<interface>>
    +stance: DiscussionStance
    +confidence: number
    +evidence: string
  }
```

### 関数フロー

```mermaid
flowchart TD
  clampConfidence["clampConfidence()"]
  generateClaimId["generateClaimId()"]
  generateEvidenceId["generateEvidenceId()"]
  parseUnitInterval["parseUnitInterval()"]
  extractField["extractField()"]
  extractMultilineField["extractMultilineField()"]
  clampConfidence -.-> generateClaimId
  generateClaimId -.-> generateEvidenceId
  generateEvidenceId -.-> parseUnitInterval
  parseUnitInterval -.-> extractField
  extractField -.-> extractMultilineField
```

## 関数

### clampConfidence

```typescript
clampConfidence(value: number): number
```

信頼度を0から1の範囲に丸める

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `number` | はい |

**戻り値**: `number`

### generateClaimId

```typescript
generateClaimId(): string
```

Generate a unique claim ID for structured communication tracking.
Format: claim-<timestamp>-<random>

**戻り値**: `string`

### generateEvidenceId

```typescript
generateEvidenceId(): string
```

構造化された通信追跡用の証拠IDを生成する

**戻り値**: `string`

### parseUnitInterval

```typescript
parseUnitInterval(raw: string | undefined): number | undefined
```

文字列から単位区間の値をパースする。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| raw | `string | undefined` | はい |

**戻り値**: `number | undefined`

### extractField

```typescript
extractField(output: string, name: string): string | undefined
```

Extract a named field from structured output text.
Matches patterns like "FIELD_NAME: value" (case-insensitive).

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| name | `string` | はい |

**戻り値**: `string | undefined`

### extractMultilineField

```typescript
extractMultilineField(output: string, name: string): string
```

指定されたフィールドの複数行を抽出する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| name | `string` | はい |

**戻り値**: `string`

### countKeywordSignals

```typescript
countKeywordSignals(output: string, keywords: string[]): number
```

出力テキストに含まれるキーワードの数をカウントする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| keywords | `string[]` | はい |

**戻り値**: `number`

### analyzeDiscussionStance

```typescript
analyzeDiscussionStance(text: string, targetMemberId: string): DiscussionStanceResult
```

対象メンバーに関する議論のスタンスを分析する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| targetMemberId | `string` | はい |

**戻り値**: `DiscussionStanceResult`

### extractConsensusMarker

```typescript
extractConsensusMarker(text: string): string | undefined
```

テキストから合意マーカーを抽出する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `string | undefined`

## インターフェース

### DiscussionStanceResult

```typescript
interface DiscussionStanceResult {
  stance: DiscussionStance;
  confidence: number;
  evidence: string[];
}
```

ディスカッションのスタンス分析結果

## 型定義

### DiscussionStance

```typescript
type DiscussionStance = "agree" | "disagree" | "neutral" | "partial"
```

ディスカッションの立場を表す型

---
*自動生成: 2026-02-18T07:48:45.339Z*
