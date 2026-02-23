---
title: concurrency
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# concurrency

## 概要

`concurrency` モジュールのAPIリファレンス。

## インポート

```typescript
// from './abort-utils': createChildAbortController
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `runWithConcurrencyLimit` | 指定した並行数制限で非同期タスクを実行する |
| インターフェース | `ConcurrencyRunOptions` | 並列実行のオプション設定 |

## 図解

### クラス図

```mermaid
classDiagram
  class ConcurrencyRunOptions {
    <<interface>>
    +signal: AbortSignal
    +abortOnError: boolean
  }
  class WorkerResult {
    <<interface>>
    +index: number
    +result: TResult
    +error: unknown
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[concurrency]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    abort_utils["abort-utils"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  ensureNotAborted["ensureNotAborted()"]
  isPoolAbortError["isPoolAbortError()"]
  runWithConcurrencyLimit["runWithConcurrencyLimit()"]
  runWorker["runWorker()"]
  toPositiveLimit["toPositiveLimit()"]
  runWithConcurrencyLimit --> ensureNotAborted
  runWithConcurrencyLimit --> isPoolAbortError
  runWithConcurrencyLimit --> runWorker
  runWithConcurrencyLimit --> toPositiveLimit
  runWorker --> ensureNotAborted
  runWorker --> isPoolAbortError
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant concurrency as "concurrency"
  participant abort_utils as "abort-utils"

  Caller->>concurrency: runWithConcurrencyLimit()
  activate concurrency
  Note over concurrency: 非同期処理開始
  concurrency->>abort_utils: 内部関数呼び出し
  abort_utils-->>concurrency: 結果
  deactivate concurrency
  concurrency-->>Caller: Promise_TResult
```

## 関数

### toPositiveLimit

```typescript
toPositiveLimit(limit: number, itemCount: number): number
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| limit | `number` | はい |
| itemCount | `number` | はい |

**戻り値**: `number`

### ensureNotAborted

```typescript
ensureNotAborted(signal?: AbortSignal): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| signal | `AbortSignal` | いいえ |

**戻り値**: `void`

### isPoolAbortError

```typescript
isPoolAbortError(error: unknown): boolean
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `boolean`

### runWithConcurrencyLimit

```typescript
async runWithConcurrencyLimit(items: TInput[], limit: number, worker: (item: TInput, index: number, signal?: AbortSignal) => Promise<TResult>, options: ConcurrencyRunOptions): Promise<TResult[]>
```

指定した並行数制限で非同期タスクを実行する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| items | `TInput[]` | はい |
| limit | `number` | はい |
| worker | `(item: TInput, index: number, signal?: AbortSig...` | はい |
| options | `ConcurrencyRunOptions` | はい |

**戻り値**: `Promise<TResult[]>`

### runWorker

```typescript
async runWorker(): Promise<void>
```

**戻り値**: `Promise<void>`

## インターフェース

### ConcurrencyRunOptions

```typescript
interface ConcurrencyRunOptions {
  signal?: AbortSignal;
  abortOnError?: boolean;
}
```

並列実行のオプション設定

### WorkerResult

```typescript
interface WorkerResult {
  index: number;
  result?: TResult;
  error?: unknown;
}
```

Result wrapper for tracking success/failure of individual workers.
Used internally to ensure all workers complete before throwing errors.

---
*自動生成: 2026-02-23T06:29:42.275Z*
