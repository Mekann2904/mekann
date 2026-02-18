---
title: error-utils
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# error-utils

## 概要

`error-utils` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `toErrorMessage` | 不明なエラーを文字列メッセージに変換します |
| 関数 | `extractStatusCodeFromMessage` | エラーメッセージからHTTPステータスコードを抽出 |
| 関数 | `classifyPressureError` | エラーを圧力関連のカテゴリに分類する |
| 関数 | `isCancelledErrorMessage` | エラーがキャンセルを示すか判定する |
| 関数 | `isTimeoutErrorMessage` | エラーがタイムアウトか判定する |
| 型 | `PressureErrorType` | 圧力エラーの分類型 |

## 図解

### 関数フロー

```mermaid
flowchart TD
  toErrorMessage["toErrorMessage()"]
  extractStatusCodeFromMessage["extractStatusCodeFromMessage()"]
  classifyPressureError["classifyPressureError()"]
  isCancelledErrorMessage["isCancelledErrorMessage()"]
  isTimeoutErrorMessage["isTimeoutErrorMessage()"]
  toErrorMessage -.-> extractStatusCodeFromMessage
  extractStatusCodeFromMessage -.-> classifyPressureError
  classifyPressureError -.-> isCancelledErrorMessage
  isCancelledErrorMessage -.-> isTimeoutErrorMessage
```

## 関数

### toErrorMessage

```typescript
toErrorMessage(error: unknown): string
```

不明なエラーを文字列メッセージに変換します

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `string`

### extractStatusCodeFromMessage

```typescript
extractStatusCodeFromMessage(error: unknown): number | undefined
```

エラーメッセージからHTTPステータスコードを抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `number | undefined`

### classifyPressureError

```typescript
classifyPressureError(error: unknown): PressureErrorType
```

エラーを圧力関連のカテゴリに分類する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `PressureErrorType`

### isCancelledErrorMessage

```typescript
isCancelledErrorMessage(error: unknown): boolean
```

エラーがキャンセルを示すか判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `boolean`

### isTimeoutErrorMessage

```typescript
isTimeoutErrorMessage(error: unknown): boolean
```

エラーがタイムアウトか判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `boolean`

## 型定義

### PressureErrorType

```typescript
type PressureErrorType = "rate_limit" | "timeout" | "capacity" | "other"
```

圧力エラーの分類型

---
*自動生成: 2026-02-18T07:48:44.966Z*
