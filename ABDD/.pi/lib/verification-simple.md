---
title: verification-simple
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# verification-simple

## 概要

`verification-simple` モジュールのAPIリファレンス。

## インポート

```typescript
// from './verification-workflow.js': detectClaimResultMismatch, detectOverconfidence, detectMissingAlternatives, ...
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `verifyOutput` | 出力を簡易検証する |
| 関数 | `simpleVerificationHook` | サブエージェント/チーム実行後の簡易検証フック |
| インターフェース | `SimpleVerificationResult` | 簡易検証結果 |
| インターフェース | `VerificationIssue` | 検出された問題 |
| インターフェース | `SimpleVerificationConfig` | 簡易検証設定 |

## 図解

### クラス図

```mermaid
classDiagram
  class SimpleVerificationResult {
    <<interface>>
    +triggered: boolean
    +issues: VerificationIssue
    +verdict: pass_pass_with_wa
    +confidenceAdjustment: number
    +triggerReason: string
  }
  class VerificationIssue {
    <<interface>>
    +type: string
    +severity: low_medium_high
    +description: string
  }
  class SimpleVerificationConfig {
    <<interface>>
    +enableMismatchDetection: boolean
    +enableOverconfidenceDetection: boolean
    +enableAlternativesDetection: boolean
    +enableBiasDetection: boolean
    +alwaysVerifyHighStakes: boolean
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[verification-simple]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    verification_workflow["verification-workflow"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  simpleVerificationHook["simpleVerificationHook()"]
  verifyOutput["verifyOutput()"]
  simpleVerificationHook --> verifyOutput
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant verification_simple as "verification-simple"
  participant verification_workflow as "verification-workflow"

  Caller->>verification_simple: verifyOutput()
  verification_simple->>verification_workflow: 内部関数呼び出し
  verification_workflow-->>verification_simple: 結果
  verification_simple-->>Caller: SimpleVerificationRe

  Caller->>verification_simple: simpleVerificationHook()
  activate verification_simple
  verification_simple-->>Caller: Promise_triggered_b
  deactivate verification_simple
```

## 関数

### verifyOutput

```typescript
verifyOutput(output: string, confidence: number, context: VerificationContext, config: Partial<SimpleVerificationConfig>): SimpleVerificationResult
```

出力を簡易検証する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| confidence | `number` | はい |
| context | `VerificationContext` | はい |
| config | `Partial<SimpleVerificationConfig>` | はい |

**戻り値**: `SimpleVerificationResult`

### simpleVerificationHook

```typescript
async simpleVerificationHook(output: string, confidence: number, context: VerificationContext): Promise<{
  triggered: boolean;
  result?: SimpleVerificationResult;
  error?: string;
}>
```

サブエージェント/チーム実行後の簡易検証フック

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| confidence | `number` | はい |
| context | `VerificationContext` | はい |

**戻り値**: `Promise<{
  triggered: boolean;
  result?: SimpleVerificationResult;
  error?: string;
}>`

## インターフェース

### SimpleVerificationResult

```typescript
interface SimpleVerificationResult {
  triggered: boolean;
  issues: VerificationIssue[];
  verdict: "pass" | "pass-with-warnings" | "needs-review" | "blocked";
  confidenceAdjustment: number;
  triggerReason: string;
}
```

簡易検証結果

### VerificationIssue

```typescript
interface VerificationIssue {
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
}
```

検出された問題

### SimpleVerificationConfig

```typescript
interface SimpleVerificationConfig {
  enableMismatchDetection: boolean;
  enableOverconfidenceDetection: boolean;
  enableAlternativesDetection: boolean;
  enableBiasDetection: boolean;
  alwaysVerifyHighStakes: boolean;
  skipThreshold: number;
}
```

簡易検証設定

---
*自動生成: 2026-02-22T18:55:29.040Z*
