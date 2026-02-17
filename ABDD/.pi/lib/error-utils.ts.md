---
title: Error Utilities
category: reference
audience: developer
last_updated: 2026-02-18
tags: [error, utilities, http, classification]
related: [errors]
---

# Error Utilities

拡張機能間で共有されるエラーハンドリングユーティリティ。

## 概要

`agent-teams.ts`、`subagents.ts`、`loop.ts`、`rsa.ts` から重複実装を統合した共通ユーティリティ。

## 型定義

### PressureErrorType

圧力エラーの分類タイプ。

```typescript
type PressureErrorType = "rate_limit" | "timeout" | "capacity" | "other";
```

## 関数

### toErrorMessage(error)

不明なエラーを文字列メッセージに変換する。

```typescript
function toErrorMessage(error: unknown): string
```

**パラメータ:**
- `error` - 変換するエラー

**戻り値:** エラーメッセージ文字列

### extractStatusCodeFromMessage(error)

エラーメッセージからHTTPステータスコードを抽出する。429または5xxコードを検索。

```typescript
function extractStatusCodeFromMessage(error: unknown): number | undefined
```

**パラメータ:**
- `error` - 抽出元のエラー

**戻り値:** 見つかった場合はステータスコード、それ以外はundefined

### classifyPressureError(error)

エラーを圧力関連カテゴリに分類する。

```typescript
function classifyPressureError(error: unknown): PressureErrorType
```

**パラメータ:**
- `error` - 分類するエラー

**戻り値:** 分類タイプ

**分類ルール:**
- `capacity`: "runtime limit reached" または "capacity" を含む
- `timeout`: "timed out" または "timeout" を含む
- `rate_limit`: ステータス429、"rate limit"、"too many requests" を含む
- `other`: その他

### isCancelledErrorMessage(error)

エラーメッセージがキャンセルを示しているか確認する。

```typescript
function isCancelledErrorMessage(error: unknown): boolean
```

**パラメータ:**
- `error` - 確認するエラー

**戻り値:** キャンセルを示す場合はtrue

**検出パターン:**
- 英語: "aborted", "cancelled", "canceled"
- 日本語: "中断", "キャンセル"

### isTimeoutErrorMessage(error)

エラーメッセージがタイムアウトを示しているか確認する。

```typescript
function isTimeoutErrorMessage(error: unknown): boolean
```

**パラメータ:**
- `error` - 確認するエラー

**戻り値:** タイムアウトを示す場合はtrue

**検出パターン:**
- 英語: "timed out", "timeout", "time out"
- 日本語: "時間切れ", "タイムアウト"

## 使用例

```typescript
import {
  toErrorMessage,
  classifyPressureError,
  isCancelledErrorMessage
} from "./error-utils.js";

// エラーメッセージ変換
const message = toErrorMessage(unknownError);

// エラー分類
const type = classifyPressureError(error);
if (type === "rate_limit") {
  // レート制限処理
}

// キャンセル確認
if (isCancelledErrorMessage(error)) {
  // キャンセル処理
}
```

## 関連ファイル

- `./errors.ts` - 統一エラークラス
- `./agent-errors.ts` - エージェントエラーユーティリティ
