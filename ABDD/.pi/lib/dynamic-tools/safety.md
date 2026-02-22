---
title: safety
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# safety

## 概要

`safety` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `analyzeCodeSafety` | コードの安全性を解析 |
| 関数 | `quickSafetyCheck` | コードの安全性分析 |
| 関数 | `checkAllowlistCompliance` | - |
| インターフェース | `SafetyAnalysisResult` | 安全解析の結果を表す |
| インターフェース | `SafetyAnalysisIssue` | 検出された安全上の問題 |
| 型 | `SafetyAnalysisIssueType` | 安全解析の種別 |

## 図解

### クラス図

```mermaid
classDiagram
  class SafetyAnalysisResult {
    <<interface>>
    +score: number
    +issues: SafetyAnalysisIssue
    +allowedOperations: string
    +blockedOperations: string
    +recommendations: string
  }
  class SafetyAnalysisIssue {
    <<interface>>
    +severity: critical_high_m
    +type: SafetyAnalysisIssueT
    +description: string
    +location: line_number_snippe
    +suggestion: string
  }
  class DangerousPattern {
    <<interface>>
    +pattern: RegExp
    +type: SafetyAnalysisIssueT
    +severity: SafetyAnalysisIssue
    +description: string
    +suggestion: string
  }
```

### 関数フロー

```mermaid
flowchart TD
  analyzeCodeSafety["analyzeCodeSafety()"]
  checkAllowlistCompliance["checkAllowlistCompliance()"]
  findLineNumber["findLineNumber()"]
  getSeverityPenalty["getSeverityPenalty()"]
  quickSafetyCheck["quickSafetyCheck()"]
  analyzeCodeSafety --> findLineNumber
  analyzeCodeSafety --> getSeverityPenalty
```

## 関数

### analyzeCodeSafety

```typescript
analyzeCodeSafety(code: string, options: {
    /** 許可された操作のリスト */
    allowlist?: string[];
    /** 厳格モード（より低いスコア） */
    strict?: boolean;
  }): SafetyAnalysisResult
```

コードの安全性を解析

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| code | `string` | はい |
| options | `object` | はい |
| &nbsp;&nbsp;↳ allowlist | `string[]` | いいえ |
| &nbsp;&nbsp;↳ strict | `boolean` | いいえ |

**戻り値**: `SafetyAnalysisResult`

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

### getSeverityPenalty

```typescript
getSeverityPenalty(severity: SafetyAnalysisIssue["severity"], strict: boolean): number
```

重大度に応じたペナルティを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| severity | `SafetyAnalysisIssue["severity"]` | はい |
| strict | `boolean` | はい |

**戻り値**: `number`

### quickSafetyCheck

```typescript
quickSafetyCheck(code: string): {
  isSafe: boolean;
  reason?: string;
}
```

コードの安全性分析

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| code | `string` | はい |

**戻り値**: `{
  isSafe: boolean;
  reason?: string;
}`

### checkAllowlistCompliance

```typescript
checkAllowlistCompliance(code: string, allowlist: string[]): {
  compliant: boolean;
  violations: string[];
}
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| code | `string` | はい |
| allowlist | `string[]` | はい |

**戻り値**: `{
  compliant: boolean;
  violations: string[];
}`

## インターフェース

### SafetyAnalysisResult

```typescript
interface SafetyAnalysisResult {
  score: number;
  issues: SafetyAnalysisIssue[];
  allowedOperations: string[];
  blockedOperations: string[];
  recommendations: string[];
  isSafe: boolean;
  confidence: number;
}
```

安全解析の結果を表す

### SafetyAnalysisIssue

```typescript
interface SafetyAnalysisIssue {
  severity: "critical" | "high" | "medium" | "low";
  type: SafetyAnalysisIssueType;
  description: string;
  location?: {
    line?: number;
    snippet?: string;
  };
  suggestion?: string;
}
```

検出された安全上の問題

### DangerousPattern

```typescript
interface DangerousPattern {
  pattern: RegExp;
  type: SafetyAnalysisIssueType;
  severity: SafetyAnalysisIssue["severity"];
  description: string;
  suggestion: string;
}
```

禁止パターンの定義

## 型定義

### SafetyAnalysisIssueType

```typescript
type SafetyAnalysisIssueType = | "file-system-write"
  | "file-system-delete"
  | "network-access"
  | "command-injection"
  | "eval-usage"
  | "process-spawn"
  | "environment-access"
  | "sensitive-data"
  | "resource-exhaustion"
  | "unbounded-operation"
  | "prototype-pollution"
  | "unsafe-regex"
```

安全解析の種別

---
*自動生成: 2026-02-22T19:27:00.614Z*
