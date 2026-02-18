---
title: model-timeouts
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# model-timeouts

## 概要

`model-timeouts` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getModelBaseTimeoutMs` | モデルの基本タイムアウトを取得 |
| 関数 | `computeModelTimeoutMs` | モデルの適切なタイムアウトを計算 |
| 関数 | `computeProgressiveTimeoutMs` | 再試行回数に応じて増加するタイムアウトを計算 |
| インターフェース | `ComputeModelTimeoutOptions` | モデルのタイムアウト計算オプション |

## 図解

### クラス図

```mermaid
classDiagram
  class ComputeModelTimeoutOptions {
    <<interface>>
    +userTimeoutMs: number
    +thinkingLevel: string
  }
```

### 関数フロー

```mermaid
flowchart TD
  getModelBaseTimeoutMs["getModelBaseTimeoutMs()"]
  computeModelTimeoutMs["computeModelTimeoutMs()"]
  computeProgressiveTimeoutMs["computeProgressiveTimeoutMs()"]
  getModelBaseTimeoutMs -.-> computeModelTimeoutMs
  computeModelTimeoutMs -.-> computeProgressiveTimeoutMs
```

## 関数

### getModelBaseTimeoutMs

```typescript
getModelBaseTimeoutMs(modelId: string): number
```

モデルの基本タイムアウトを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| modelId | `string` | はい |

**戻り値**: `number`

### computeModelTimeoutMs

```typescript
computeModelTimeoutMs(modelId: string, options?: ComputeModelTimeoutOptions): number
```

モデルの適切なタイムアウトを計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| modelId | `string` | はい |
| options | `ComputeModelTimeoutOptions` | いいえ |

**戻り値**: `number`

### computeProgressiveTimeoutMs

```typescript
computeProgressiveTimeoutMs(baseTimeoutMs: number, attempt: number): number
```

再試行回数に応じて増加するタイムアウトを計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| baseTimeoutMs | `number` | はい |
| attempt | `number` | はい |

**戻り値**: `number`

## インターフェース

### ComputeModelTimeoutOptions

```typescript
interface ComputeModelTimeoutOptions {
  userTimeoutMs?: number;
  thinkingLevel?: string;
}
```

モデルのタイムアウト計算オプション

---
*自動生成: 2026-02-18T07:17:30.459Z*
