---
title: rate-limit-retry-budget
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# rate-limit-retry-budget

## 概要

`rate-limit-retry-budget` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs/promises': readFile, writeFile
// from 'node:module': createRequire
// from '@mariozechner/pi-coding-agent': ExtensionAPI
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerRateLimitRetryBudgetExtension` | リトライ予算拡張登録 |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[rate-limit-retry-budget]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  applyPatch["applyPatch()"]
  registerRateLimitRetryBudgetExtension["registerRateLimitRetryBudgetExtension()"]
  registerRateLimitRetryBudgetExtension --> applyPatch
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant rate_limit_retry_budget as "rate-limit-retry-budget"
  participant mariozechner as "@mariozechner"

  Caller->>rate_limit_retry_budget: registerRateLimitRetryBudgetExtension()
  rate_limit_retry_budget->>mariozechner: API呼び出し
  mariozechner-->>rate_limit_retry_budget: レスポンス
  rate_limit_retry_budget-->>Caller: void
```

## 関数

### applyPatch

```typescript
async applyPatch(requireFn: NodeRequire): Promise<"patched" | "already" | "skip">
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| requireFn | `NodeRequire` | はい |

**戻り値**: `Promise<"patched" | "already" | "skip">`

### registerRateLimitRetryBudgetExtension

```typescript
registerRateLimitRetryBudgetExtension(pi: ExtensionAPI): void
```

リトライ予算拡張登録

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

## 型定義

### Replacement

```typescript
type Replacement = {
  marker: string;
  beforeCandidates: string[];
  after: string;
}
```

---
*自動生成: 2026-02-24T17:08:02.327Z*
