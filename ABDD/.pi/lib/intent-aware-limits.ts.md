---
title: Intent-Aware Limits
category: reference
audience: developer
last_updated: 2026-02-18
tags: [intent, classification, budget, limits]
related: [semantic-repetition, dynamic-parallelism]
---

# Intent-Aware Limits

タスクインテント分類に基づいてリソース割り当てを調整するモジュール。

## 概要

論文「Agentic Search in the Wild」（arXiv:2601.17617v2）の知見に基づく：

- **宣言的（事実検索）**: 88.64% - 高い反復率、早期収束
- **手続き的（方法）**: 3.96% - より深い検索、意味的安定性
- **推論（分析）**: 7.41% - 最大の意味的ドリフト、最長クエリ

## 型定義

### TaskIntent

タスクインテントタイプ。

```typescript
type TaskIntent = "declarative" | "procedural" | "reasoning";
```

### IntentBudget

インテント対応予算設定。

```typescript
interface IntentBudget {
  intent: TaskIntent;
  maxIterations: number;           // 推奨最大反復数
  timeoutMultiplier: number;       // タイムアウト乗数
  parallelismMultiplier: number;   // 並列性乗数
  repetitionTolerance: number;     // 反復許容度 (0-1)
  description: string;             // 予算プロファイルの説明
}
```

### IntentClassificationInput

インテント分類の入力。

```typescript
interface IntentClassificationInput {
  task: string;          // タスク説明
  goal?: string;         // 目標基準
  referenceCount?: number; // 利用可能な参照数
}
```

### IntentClassificationResult

インテント分類の結果。

```typescript
interface IntentClassificationResult {
  intent: TaskIntent;
  confidence: number;              // 信頼度スコア (0-1)
  matchedPatterns: string[];       // 一致したパターン
  recommendedBudget: IntentBudget; // 推奨予算
}
```

## 定数

### INTENT_BUDGETS

論文の知見に基づく予算プロファイル。

| インテント | 最大反復 | タイムアウト乗数 | 並列性乗数 | 許容度 | 説明 |
|-----------|---------|----------------|-----------|-------|------|
| declarative | 6 | 1.0 | 1.0 | 0.6 | 高い反復率が予想される事実検索タスク |
| procedural | 10 | 1.5 | 0.8 | 0.4 | 意味的安定性が必要なステップ実行タスク |
| reasoning | 12 | 2.0 | 1.2 | 0.3 | 意味的ドリフトが予想される複雑な分析タスク |

## 関数

### classifyIntent(input)

コンテンツ分析に基づいてタスクインテントを分類する。

```typescript
function classifyIntent(input: IntentClassificationInput): IntentClassificationResult
```

**分類パターン:**

**宣言的:**
- 事実検索: "what is", "find", "search for", "look up", "locate", "get", "retrieve"
- 検証: "check if", "verify that", "confirm", "validate", "does", "is there"
- 単純検索: "show me", "list", "display", "tell me"

**手続き的:**
- アクション指向: "how to", "steps to", "implement", "create", "build", "configure"
- 実行: "execute", "run", "start", "stop", "restart"
- 変更: "update", "modify", "change", "fix", "patch", "refactor"

**推論:**
- 分析: "analyze", "compare", "evaluate", "assess", "review", "investigate"
- 統合: "design", "architect", "plan", "strategy", "approach"
- 推論: "why", "because", "therefore", "if then", "consider", "weigh"
- マルチホップ: "combine", "integrate", "synthesize", "correlate"

### getIntentBudget(intent)

特定のインテントの予算を取得する。

```typescript
function getIntentBudget(intent: TaskIntent): IntentBudget
```

### applyIntentLimits(baseLimits, intent)

インテント対応調整をベース制限に適用する。

```typescript
function applyIntentLimits<T extends {
  maxIterations?: number;
  timeoutMs?: number;
  parallelism?: number;
}>(baseLimits: T, intent: TaskIntent): T
```

**調整ロジック:**
- `maxIterations`: ベース値と予算値の小さい方
- `timeoutMs`: ベース値に乗数を適用
- `parallelism`: ベース値に乗数を適用

### getEffectiveRepetitionThreshold(baseThreshold, intent)

インテントに基づいて有効な反復閾値を計算する。

```typescript
function getEffectiveRepetitionThreshold(
  baseThreshold: number,
  intent: TaskIntent
): number
```

**計算式:** `baseThreshold + (budget.repetitionTolerance - 0.5) * 0.2`

### isIntentClassificationAvailable()

インテント分類が利用可能かどうかを確認する。

```typescript
function isIntentClassificationAvailable(): boolean
```

**戻り値:** 常に `true`（パターンベース、外部依存なし）

### getAllIntentBudgets()

全インテント予算を取得する。

```typescript
function getAllIntentBudgets(): Record<TaskIntent, IntentBudget>
```

### summarizeIntentClassification(result)

インテント分類をロギング用に要約する。

```typescript
function summarizeIntentClassification(result: IntentClassificationResult): string
```

**出力形式:** `Intent: {intent} ({confidence}% confidence) | Budget: max {steps} steps, {multiplier}x timeout | Patterns: {patterns}`

## 使用例

```typescript
import {
  classifyIntent,
  getIntentBudget,
  applyIntentLimits
} from "./intent-aware-limits.js";

// インテント分類
const result = classifyIntent({
  task: "Analyze the codebase for potential optimizations"
});

console.log(summarizeIntentClassification(result));
// Intent: reasoning (75% confidence) | Budget: max 12 steps, 2x timeout | Patterns: analyze, investigate

// 予算適用
const baseLimits = {
  maxIterations: 20,
  timeoutMs: 60000,
  parallelism: 4
};

const adjustedLimits = applyIntentLimits(baseLimits, result.intent);
// { maxIterations: 12, timeoutMs: 120000, parallelism: 4.8 }
```

## 関連ファイル

- `./semantic-repetition.ts` - 意味的反復検出
- `./dynamic-parallelism.ts` - 動的並列処理調整
