---
title: Errors (Common Error Classes)
category: reference
audience: developer
last_updated: 2026-02-18
tags: [error, exception, validation, runtime]
related: [error-utils, agent-errors]
---

# Errors (Common Error Classes)

pi-pluginの共通エラークラス。全拡張機能で統一されたエラーハンドリングを提供する。

## 概要

一貫したエラー階層を確立し、プログラムによるエラー処理とロギングを標準化する。

## 型定義

### PiErrorCode

piエラーの標準化されたエラーコード。

```typescript
type PiErrorCode =
  | "UNKNOWN_ERROR"
  | "RUNTIME_LIMIT_REACHED"
  | "RUNTIME_QUEUE_WAIT"
  | "SCHEMA_VIOLATION"
  | "VALIDATION_ERROR"
  | "TIMEOUT_ERROR"
  | "CANCELLED_ERROR"
  | "RATE_LIMIT_ERROR"
  | "CAPACITY_ERROR"
  | "PARSING_ERROR";
```

### ErrorSeverity

エラー重要度レベル。

```typescript
type ErrorSeverity = "low" | "medium" | "high" | "critical";
```

### ErrorContext

エラーハンドリング用の追加コンテキスト。

```typescript
interface ErrorContext {
  operation?: string;                  // 失敗した操作
  component?: string;                  // エラー発生コンポーネント
  metadata?: Record<string, unknown>;  // 追加メタデータ
  timestamp?: number;                  // タイムスタンプ
}
```

## 基本エラークラス

### PiError

pi固有エラーの基底クラス。

```typescript
class PiError extends Error {
  code: PiErrorCode;
  retryable: boolean;
  cause?: Error;
  timestamp: number;

  constructor(
    message: string,
    code?: PiErrorCode,
    options?: { retryable?: boolean; cause?: Error }
  );

  is(code: PiErrorCode): boolean;
  toJSON(): Record<string, unknown>;
}
```

**機能:**
- プログラムによる処理のためのエラーコード
- 再試行ロジックのための再試行可能フラグ
- エラー追跡のための原因チェーン
- デバッグ用タイムスタンプ

## ランタイムエラー

### RuntimeLimitError

ランタイム容量制限に達したときにスローされる。即座には再試行不可。

```typescript
class RuntimeLimitError extends PiError {
  currentCount?: number;
  maxCount?: number;

  constructor(
    message: string,
    options?: { currentCount?: number; maxCount?: number; cause?: Error }
  );
}
```

### RuntimeQueueWaitError

ランタイムキューでの待機がタイムアウトしたときにスローされる。再試理可能。

```typescript
class RuntimeQueueWaitError extends PiError {
  waitTimeMs?: number;
  maxWaitMs?: number;
}
```

## 検証エラー

### SchemaValidationError

出力スキーマ検証が失敗したときにスローされる。再試行可能。

```typescript
class SchemaValidationError extends PiError {
  violations: string[];
  field?: string;
}
```

### ValidationError

一般的な検証が失敗したときにスローされる。再試行不可。

```typescript
class ValidationError extends PiError {
  field?: string;
  expected?: string;
  actual?: string;
}
```

## タイムアウト & キャンセルエラー

### TimeoutError

操作がタイムアウトしたときにスローされる。再試行可能。

```typescript
class TimeoutError extends PiError {
  timeoutMs?: number;
}
```

### CancelledError

操作がキャンセルされたときにスローされる。再試行不可。

```typescript
class CancelledError extends PiError {
  reason?: string;
}
```

## レート制限 & 容量エラー

### RateLimitError

レート制限に達したときにスローされる。待機後に再試行可能。

```typescript
class RateLimitError extends PiError {
  retryAfterMs?: number;
}
```

### CapacityError

システム容量を超過したときにスローされる。即座には再試行不可。

```typescript
class CapacityError extends PiError {
  resource?: string;
}
```

## その他のエラー

### ParsingError

パースが失敗したときにスローされる。再試行可能。

```typescript
class ParsingError extends PiError {
  content?: string;
  position?: number;
}
```

### ExecutionError

実行操作中にスローされる。

```typescript
class ExecutionError extends PiError {
  severity: ErrorSeverity;
  context?: ErrorContext;
}
```

### ConfigurationError

設定問題に対してスローされる。再試行不可。

```typescript
class ConfigurationError extends PiError {
  key?: string;
  expected?: string;
}
```

### StorageError

ストレージ操作に対してスローされる。再試行可能。

```typescript
class StorageError extends PiError {
  path?: string;
  operation?: "read" | "write" | "delete" | "lock";
}
```

## ユーティリティ関数

### isPiError(error)

エラーがPiErrorまたはそのサブクラスかどうかを確認する。

```typescript
function isPiError(error: unknown): error is PiError
```

### hasErrorCode(error, code)

エラーが特定のエラーコードを持っているかどうかを確認する。

```typescript
function hasErrorCode(error: unknown, code: PiErrorCode): boolean
```

### isRetryableError(error)

エラーが再試行可能かどうかを確認する。

```typescript
function isRetryableError(error: unknown): boolean
```

### toPiError(error)

任意のエラーをPiErrorに変換する。

```typescript
function toPiError(error: unknown): PiError
```

### getErrorCode(error)

エラーからエラーコードを取得する。

```typescript
function getErrorCode(error: unknown): PiErrorCode
```

### isRetryableErrorCode(code)

エラーコードが再試行可能な状態を示しているかどうかを確認する。

```typescript
function isRetryableErrorCode(code: PiErrorCode): boolean
```

**再試行可能コード:**
- `TIMEOUT_ERROR`
- `RATE_LIMIT_ERROR`
- `SCHEMA_VIOLATION`
- `PARSING_ERROR`
- `RUNTIME_QUEUE_WAIT`

## 使用例

```typescript
import {
  PiError,
  RuntimeLimitError,
  SchemaValidationError,
  isRetryableError
} from "./errors.js";

// ランタイム制限エラーをスロー
throw new RuntimeLimitError("Maximum parallel executions reached");

// スキーマ検証エラーをスロー
throw new SchemaValidationError("Missing required field: summary");

// 再試行可能性確認
if (isRetryableError(error)) {
  // 再試行ロジック
}
```

## 関連ファイル

- `./error-utils.ts` - エラーユーティリティ関数
- `./agent-errors.ts` - エージェントエラービルダー
