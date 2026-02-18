---
title: runtime-utils
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# runtime-utils

## 概要

`runtime-utils` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-ai': Type
// from './retry-with-backoff.js': RetryWithBackoffOverrides
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `trimForError` | エラーメッセージ整形 |
| 関数 | `buildRateLimitKey` | レート制限キー生成 |
| 関数 | `buildTraceTaskId` | トレースID生成 |
| 関数 | `normalizeTimeoutMs` | タイムアウト正規化 |
| 関数 | `createRetrySchema` | スキーマ生成 |
| 関数 | `toRetryOverrides` | リトライ設定変換 |
| 関数 | `toConcurrencyLimit` | 並行数変換 |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[runtime-utils]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    retry_with_backoff["retry-with-backoff"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant runtime_utils as "runtime-utils"
  participant mariozechner as "@mariozechner"
  participant retry_with_backoff as "retry-with-backoff"

  Caller->>runtime_utils: trimForError()
  runtime_utils->>mariozechner: API呼び出し
  mariozechner-->>runtime_utils: レスポンス
  runtime_utils->>retry_with_backoff: 内部関数呼び出し
  retry_with_backoff-->>runtime_utils: 結果
  runtime_utils-->>Caller: string

  Caller->>runtime_utils: buildRateLimitKey()
  runtime_utils-->>Caller: string
```

## 関数

### trimForError

```typescript
trimForError(message: string, maxLength: any): string
```

エラーメッセージ整形

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| message | `string` | はい |
| maxLength | `any` | はい |

**戻り値**: `string`

### buildRateLimitKey

```typescript
buildRateLimitKey(provider: string, model: string): string
```

レート制限キー生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `string`

### buildTraceTaskId

```typescript
buildTraceTaskId(traceId: string | undefined, delegateId: string, sequence: number): string
```

トレースID生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| traceId | `string | undefined` | はい |
| delegateId | `string` | はい |
| sequence | `number` | はい |

**戻り値**: `string`

### normalizeTimeoutMs

```typescript
normalizeTimeoutMs(value: unknown, fallback: number): number
```

タイムアウト正規化

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |
| fallback | `number` | はい |

**戻り値**: `number`

### createRetrySchema

```typescript
createRetrySchema(): void
```

スキーマ生成

**戻り値**: `void`

### toRetryOverrides

```typescript
toRetryOverrides(value: unknown): RetryWithBackoffOverrides | undefined
```

リトライ設定変換

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |

**戻り値**: `RetryWithBackoffOverrides | undefined`

### toConcurrencyLimit

```typescript
toConcurrencyLimit(value: unknown, fallback: number): number
```

並行数変換

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |
| fallback | `number` | はい |

**戻り値**: `number`

---
*自動生成: 2026-02-18T15:54:41.512Z*
