---
title: intent-aware-limits
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# intent-aware-limits

## 概要

`intent-aware-limits` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `classifyIntent` | 意図の分類実行 |
| 関数 | `getIntentBudget` | 意図予算の取得 |
| 関数 | `applyIntentLimits` | 意図に応じた制限適用 |
| 関数 | `getEffectiveRepetitionThreshold` | インテントに基づき反復しきい値を計算 |
| 関数 | `isIntentClassificationAvailable` | インテント分類利用可否判定 |
| 関数 | `getAllIntentBudgets` | - |
| 関数 | `summarizeIntentClassification` | 意図分類結果の要約ログを生成 |
| インターフェース | `IntentBudget` | タスクの意図タイプ |
| インターフェース | `IntentClassificationInput` | 意図分類の入力 |
| インターフェース | `IntentClassificationResult` | 意図分類の結果 |
| 型 | `TaskIntent` | タスクの意図タイプを定義 |

## 図解

### クラス図

```mermaid
classDiagram
  class IntentBudget {
    <<interface>>
    +intent: TaskIntent
    +maxIterations: number
    +timeoutMultiplier: number
    +parallelismMultiplier: number
    +repetitionTolerance: number
  }
  class IntentClassificationInput {
    <<interface>>
    +task: string
    +goal: string
    +referenceCount: number
  }
  class IntentClassificationResult {
    <<interface>>
    +intent: TaskIntent
    +confidence: number
    +matchedPatterns: string
    +recommendedBudget: IntentBudget
  }
```

## 関数

### classifyIntent

```typescript
classifyIntent(input: IntentClassificationInput): IntentClassificationResult
```

意図の分類実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `IntentClassificationInput` | はい |

**戻り値**: `IntentClassificationResult`

### getIntentBudget

```typescript
getIntentBudget(intent: TaskIntent): IntentBudget
```

意図予算の取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| intent | `TaskIntent` | はい |

**戻り値**: `IntentBudget`

### applyIntentLimits

```typescript
applyIntentLimits(baseLimits: T, intent: TaskIntent): T
```

意図に応じた制限適用

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| baseLimits | `T` | はい |
| intent | `TaskIntent` | はい |

**戻り値**: `T`

### getEffectiveRepetitionThreshold

```typescript
getEffectiveRepetitionThreshold(baseThreshold: number, intent: TaskIntent): number
```

インテントに基づき反復しきい値を計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| baseThreshold | `number` | はい |
| intent | `TaskIntent` | はい |

**戻り値**: `number`

### isIntentClassificationAvailable

```typescript
isIntentClassificationAvailable(): boolean
```

インテント分類利用可否判定

**戻り値**: `boolean`

### getAllIntentBudgets

```typescript
getAllIntentBudgets(): Record<TaskIntent, IntentBudget>
```

**戻り値**: `Record<TaskIntent, IntentBudget>`

### summarizeIntentClassification

```typescript
summarizeIntentClassification(result: IntentClassificationResult): string
```

意図分類結果の要約ログを生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `IntentClassificationResult` | はい |

**戻り値**: `string`

## インターフェース

### IntentBudget

```typescript
interface IntentBudget {
  intent: TaskIntent;
  maxIterations: number;
  timeoutMultiplier: number;
  parallelismMultiplier: number;
  repetitionTolerance: number;
  description: string;
}
```

タスクの意図タイプ

### IntentClassificationInput

```typescript
interface IntentClassificationInput {
  task: string;
  goal?: string;
  referenceCount?: number;
}
```

意図分類の入力

### IntentClassificationResult

```typescript
interface IntentClassificationResult {
  intent: TaskIntent;
  confidence: number;
  matchedPatterns: string[];
  recommendedBudget: IntentBudget;
}
```

意図分類の結果

## 型定義

### TaskIntent

```typescript
type TaskIntent = "declarative" | "procedural" | "reasoning"
```

タスクの意図タイプを定義

---
*自動生成: 2026-02-18T15:54:41.486Z*
