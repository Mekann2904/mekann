---
title: agent-types
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# agent-types

## 概要

`agent-types` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| インターフェース | `RunOutcomeSignal` | 実行結果シグナル |
| 型 | `ThinkingLevel` | モデルの推論レベル |
| 型 | `RunOutcomeCode` | 実行結果コード |

## 図解

### クラス図

```mermaid
classDiagram
  class RunOutcomeSignal {
    <<interface>>
    +outcomeCode: RunOutcomeCode
    +retryRecommended: boolean
  }
```

## インターフェース

### RunOutcomeSignal

```typescript
interface RunOutcomeSignal {
  outcomeCode: RunOutcomeCode;
  retryRecommended: boolean;
}
```

実行結果シグナル

## 型定義

### ThinkingLevel

```typescript
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
```

モデルの推論レベル

### RunOutcomeCode

```typescript
type RunOutcomeCode = | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "RETRYABLE_FAILURE"
  | "NONRETRYABLE_FAILURE"
  | "CANCELLED"
  | "TIMEOUT"
```

実行結果コード

---
*自動生成: 2026-02-18T18:06:17.482Z*
