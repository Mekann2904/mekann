---
title: abort-utils
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# abort-utils

## 概要

`abort-utils` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `createChildAbortController` | Creates a child AbortController that aborts when t |
| 関数 | `createChildAbortControllers` | Creates multiple child AbortControllers from a sin |

## 図解

### 関数フロー

```mermaid
flowchart TD
  createChildAbortController["createChildAbortController()"]
  createChildAbortControllers["createChildAbortControllers()"]
  createChildAbortController -.-> createChildAbortControllers
```

## 関数

### createChildAbortController

```typescript
createChildAbortController(parentSignal?: AbortSignal): { controller: AbortController; cleanup: () => void }
```

Creates a child AbortController that aborts when the parent signal aborts.
Each child has its own signal, preventing listener accumulation on the parent.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| parentSignal | `AbortSignal` | いいえ |

**戻り値**: `{ controller: AbortController; cleanup: () => void }`

### onParentAbort

```typescript
onParentAbort(): void
```

**戻り値**: `void`

### cleanup

```typescript
cleanup(): void
```

**戻り値**: `void`

### createChildAbortControllers

```typescript
createChildAbortControllers(count: number, parentSignal?: AbortSignal): { controllers: AbortController[]; cleanup: () => void }
```

Creates multiple child AbortControllers from a single parent signal.
Useful for parallel execution where each worker needs its own signal.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| count | `number` | はい |
| parentSignal | `AbortSignal` | いいえ |

**戻り値**: `{ controllers: AbortController[]; cleanup: () => void }`

---
*自動生成: 2026-02-18T00:15:35.636Z*
