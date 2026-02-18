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
| 関数 | `classifyIntent` | タスクの意図を分類する |
| 関数 | `getIntentBudget` | 意図に応じた予算を取得する。 |
| 関数 | `applyIntentLimits` | インテントに基づいて制限値を調整する |
| 関数 | `getEffectiveRepetitionThreshold` | インテントに基づく反復しきい値を計算 |
| 関数 | `isIntentClassificationAvailable` | インテント分類が利用可能か判定する |
| 関数 | `getAllIntentBudgets` | 全てのインテント予算を取得する |
| 関数 | `summarizeIntentClassification` | 意図分類結果の要約ログを生成 |
| インターフェース | `IntentBudget` | インテント対応の予算設定。 |
| インターフェース | `IntentClassificationInput` | 意図分類の入力データ |
| インターフェース | `IntentClassificationResult` | 意図分類の結果を表します。 |
| 型 | `TaskIntent` | タスクの意図タイプ |

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

### 関数フロー

```mermaid
flowchart TD
  classifyIntent["classifyIntent()"]
  getIntentBudget["getIntentBudget()"]
  applyIntentLimits["applyIntentLimits()"]
  getEffectiveRepetitionThreshold["getEffectiveRepetitionThreshold()"]
  isIntentClassificationAvailable["isIntentClassificationAvailable()"]
  getAllIntentBudgets["getAllIntentBudgets()"]
  classifyIntent -.-> getIntentBudget
  getIntentBudget -.-> applyIntentLimits
  applyIntentLimits -.-> getEffectiveRepetitionThreshold
  getEffectiveRepetitionThreshold -.-> isIntentClassificationAvailable
  isIntentClassificationAvailable -.-> getAllIntentBudgets
```

## 関数

### classifyIntent

```typescript
classifyIntent(input: IntentClassificationInput): IntentClassificationResult
```

タスクの意図を分類する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `IntentClassificationInput` | はい |

**戻り値**: `IntentClassificationResult`

### getIntentBudget

```typescript
getIntentBudget(intent: TaskIntent): IntentBudget
```

意図に応じた予算を取得する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| intent | `TaskIntent` | はい |

**戻り値**: `IntentBudget`

### applyIntentLimits

```typescript
applyIntentLimits(baseLimits: T, intent: TaskIntent): T
```

インテントに基づいて制限値を調整する

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

インテントに基づく反復しきい値を計算

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

インテント分類が利用可能か判定する

**戻り値**: `boolean`

### getAllIntentBudgets

```typescript
getAllIntentBudgets(): Record<TaskIntent, IntentBudget>
```

全てのインテント予算を取得する

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

インテント対応の予算設定。

### IntentClassificationInput

```typescript
interface IntentClassificationInput {
  task: string;
  goal?: string;
  referenceCount?: number;
}
```

意図分類の入力データ

### IntentClassificationResult

```typescript
interface IntentClassificationResult {
  intent: TaskIntent;
  confidence: number;
  matchedPatterns: string[];
  recommendedBudget: IntentBudget;
}
```

意図分類の結果を表します。

## 型定義

### TaskIntent

```typescript
type TaskIntent = "declarative" | "procedural" | "reasoning"
```

タスクの意図タイプ

---
*自動生成: 2026-02-18T07:48:44.995Z*
