---
title: quality
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# quality

## 概要

`quality` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `assessCodeQuality` | 品質を評価する |
| 関数 | `recordExecutionMetrics` | メトリクスを記録する |
| 関数 | `getUsageStatistics` | 統計を取得する |
| 関数 | `getAllUsageStatistics` | 全統計を取得する |
| 関数 | `resetUsageStatistics` | 統計を初期化する |
| 関数 | `recordQualityScore` | スコア記録 |
| 関数 | `analyzeQualityTrend` | 品質傾向分析 |
| インターフェース | `QualityAssessment` | 品質評価結果 |
| インターフェース | `CategoryScores` | カテゴリ別スコア |
| インターフェース | `QualityIssue` | 品質課題 |
| インターフェース | `ExecutionMetrics` | 実行メトリクス |
| インターフェース | `ToolUsageStatistics` | ツール使用統計 |

## 図解

### クラス図

```mermaid
classDiagram
  class QualityAssessment {
    <<interface>>
    +score: number
    +categoryScores: CategoryScores
    +issues: QualityIssue
    +improvements: string
    +confidence: number
  }
  class CategoryScores {
    <<interface>>
    +readability: number
    +errorHandling: number
    +documentation: number
    +testability: number
    +performance: number
  }
  class QualityIssue {
    <<interface>>
    +category: keyofCategoryScores
    +severity: high_medium_low
    +description: string
    +location: line_number_snippe
    +suggestion: string
  }
  class ExecutionMetrics {
    <<interface>>
    +executionTimeMs: number
    +memoryUsedBytes: number
    +success: boolean
    +errorType: string
    +errorMessage: string
  }
  class ToolUsageStatistics {
    <<interface>>
    +toolId: string
    +totalUsage: number
    +successCount: number
    +failureCount: number
    +avgExecutionTimeMs: number
  }
  class QualityPattern {
    <<interface>>
    +pattern: RegExp
    +category: keyofCategoryScores
    +severity: QualityIssue_severi
    +description: string
    +suggestion: string
  }
```

### 関数フロー

```mermaid
flowchart TD
  analyzeQualityTrend["analyzeQualityTrend()"]
  assessCodeQuality["assessCodeQuality()"]
  calculateConfidence["calculateConfidence()"]
  extractFunctionLengths["extractFunctionLengths()"]
  findLineNumber["findLineNumber()"]
  generateImprovements["generateImprovements()"]
  getAllUsageStatistics["getAllUsageStatistics()"]
  getUsageStatistics["getUsageStatistics()"]
  recordExecutionMetrics["recordExecutionMetrics()"]
  recordQualityScore["recordQualityScore()"]
  resetUsageStatistics["resetUsageStatistics()"]
  assessCodeQuality --> calculateConfidence
  assessCodeQuality --> extractFunctionLengths
  assessCodeQuality --> findLineNumber
  assessCodeQuality --> generateImprovements
  extractFunctionLengths --> findLineNumber
```

## 関数

### assessCodeQuality

```typescript
assessCodeQuality(code: string): QualityAssessment
```

品質を評価する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| code | `string` | はい |

**戻り値**: `QualityAssessment`

### findLineNumber

```typescript
findLineNumber(lines: string[], index: number): number
```

行番号を検索

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| lines | `string[]` | はい |
| index | `number` | はい |

**戻り値**: `number`

### extractFunctionLengths

```typescript
extractFunctionLengths(code: string): Array<{ name: string; length: number; startLine: number }>
```

関数の長さを抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| code | `string` | はい |

**戻り値**: `Array<{ name: string; length: number; startLine: number }>`

### generateImprovements

```typescript
generateImprovements(scores: CategoryScores, issues: QualityIssue[]): string[]
```

改善提案を生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| scores | `CategoryScores` | はい |
| issues | `QualityIssue[]` | はい |

**戻り値**: `string[]`

### calculateConfidence

```typescript
calculateConfidence(code: string, issueCount: number): number
```

信頼度を計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| code | `string` | はい |
| issueCount | `number` | はい |

**戻り値**: `number`

### recordExecutionMetrics

```typescript
recordExecutionMetrics(toolId: string, metrics: ExecutionMetrics): void
```

メトリクスを記録する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolId | `string` | はい |
| metrics | `ExecutionMetrics` | はい |

**戻り値**: `void`

### getUsageStatistics

```typescript
getUsageStatistics(toolId: string): ToolUsageStatistics | undefined
```

統計を取得する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolId | `string` | はい |

**戻り値**: `ToolUsageStatistics | undefined`

### getAllUsageStatistics

```typescript
getAllUsageStatistics(): ToolUsageStatistics[]
```

全統計を取得する

**戻り値**: `ToolUsageStatistics[]`

### resetUsageStatistics

```typescript
resetUsageStatistics(): void
```

統計を初期化する

**戻り値**: `void`

### recordQualityScore

```typescript
recordQualityScore(toolId: string, score: number): void
```

スコア記録

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolId | `string` | はい |
| score | `number` | はい |

**戻り値**: `void`

### analyzeQualityTrend

```typescript
analyzeQualityTrend(toolId: string): {
  trend: "improving" | "declining" | "stable";
  avgRecentScore: number;
  changeRate: number;
}
```

品質傾向分析

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolId | `string` | はい |

**戻り値**: `{
  trend: "improving" | "declining" | "stable";
  avgRecentScore: number;
  changeRate: number;
}`

## インターフェース

### QualityAssessment

```typescript
interface QualityAssessment {
  score: number;
  categoryScores: CategoryScores;
  issues: QualityIssue[];
  improvements: string[];
  confidence: number;
}
```

品質評価結果

### CategoryScores

```typescript
interface CategoryScores {
  readability: number;
  errorHandling: number;
  documentation: number;
  testability: number;
  performance: number;
  securityAwareness: number;
}
```

カテゴリ別スコア

### QualityIssue

```typescript
interface QualityIssue {
  category: keyof CategoryScores;
  severity: "high" | "medium" | "low";
  description: string;
  location?: {
    line?: number;
    snippet?: string;
  };
  suggestion: string;
}
```

品質課題

### ExecutionMetrics

```typescript
interface ExecutionMetrics {
  executionTimeMs: number;
  memoryUsedBytes?: number;
  success: boolean;
  errorType?: string;
  errorMessage?: string;
  inputParameters?: Record<string, unknown>;
  outputSizeBytes?: number;
}
```

実行メトリクス

### ToolUsageStatistics

```typescript
interface ToolUsageStatistics {
  toolId: string;
  totalUsage: number;
  successCount: number;
  failureCount: number;
  avgExecutionTimeMs: number;
  maxExecutionTimeMs: number;
  minExecutionTimeMs: number;
  avgMemoryBytes?: number;
  successRate: number;
  errorBreakdown: Record<string, number>;
  recentExecutions: ExecutionMetrics[];
  qualityTrend: number[];
}
```

ツール使用統計

### QualityPattern

```typescript
interface QualityPattern {
  pattern: RegExp;
  category: keyof CategoryScores;
  severity: QualityIssue["severity"];
  description: string;
  suggestion: string;
  isPositive: boolean;
}
```

品質パターンの定義

---
*自動生成: 2026-02-22T19:27:00.609Z*
