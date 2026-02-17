---
title: structured-logger
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# structured-logger

## 概要

`structured-logger` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getMinLogLevel` | 環境変数から最小ログレベルを取得する |
| 関数 | `resetMinLogLevelCache` | キャッシュされた最小ログレベルをリセット（テスト用） |
| 関数 | `formatTimestamp` | ISO8601形式のタイムスタンプを生成する |
| 関数 | `shouldLog` | ログレベルが最小レベル以上かどうかを判定する |
| 関数 | `formatError` | エラーオブジェクトを構造化された形式に変換する |
| 関数 | `serializeLogEntry` | ログエントリをJSON文字列に変換する |
| 関数 | `formatReadableEntry` | ログエントリを読み取り可能な形式でフォーマットする |
| 関数 | `getDefaultLogger` | デフォルトロガーを取得する |
| 関数 | `resetDefaultLogger` | デフォルトロガーをリセット（テスト用） |
| 関数 | `createLogger` | 指定されたコンテキストでロガーを作成する |
| 関数 | `getSubagentLogger` | subagentsコンテキストのロガーを取得 |
| 関数 | `getAgentTeamsLogger` | agent-teamsコンテキストのロガーを取得 |
| 関数 | `getStorageLogger` | storageコンテキストのロガーを取得 |
| 関数 | `logInfo` | クイックINFOログ |
| 関数 | `logWarn` | クイックWARNログ |
| 関数 | `logError` | クイックERRORログ |
| 関数 | `logDebug` | クイックDEBUGログ |
| クラス | `StructuredLogger` | 構造化ロガークラス |
| クラス | `ChildLogger` | 子ロガー - 操作名が固定されたロガー |
| インターフェース | `StructuredLogEntry` | 構造化ログエントリのインターフェース |
| インターフェース | `StructuredLoggerOptions` | ロガー設定オプション |
| 型 | `LogLevel` | ログレベル定義 |
| 型 | `LogContext` | ログコンテキスト定義 |

## 図解

### クラス図

```mermaid
classDiagram
  class StructuredLogger {
    -minLevel: LogLevel
    -context: LogContextstring
    -correlationId: string
    -output: consolestdoutstderr
    -json: boolean
    +child
    -log
    -outputEntry
    +debug
    +info
  }
  class ChildLogger {
    +debug
    +info
    +warn
    +error
    +withTiming
  }
  class StructuredLogEntry {
    <<interface>>
    +timestamp: string
    +level: LogLevel
    +context: LogContextstring
    +operation: string
    +message: string
  }
  class StructuredLoggerOptions {
    <<interface>>
    +minLevel: LogLevel
    +context: LogContextstring
    +correlationId: string
    +output: consolestdoutstderr
    +json: boolean
  }
```

### 関数フロー

```mermaid
flowchart TD
  getMinLogLevel["getMinLogLevel()"]
  resetMinLogLevelCache["resetMinLogLevelCache()"]
  formatTimestamp["formatTimestamp()"]
  shouldLog["shouldLog()"]
  formatError["formatError()"]
  serializeLogEntry["serializeLogEntry()"]
  getMinLogLevel -.-> resetMinLogLevelCache
  resetMinLogLevelCache -.-> formatTimestamp
  formatTimestamp -.-> shouldLog
  shouldLog -.-> formatError
  formatError -.-> serializeLogEntry
```

## 関数

### getMinLogLevel

```typescript
getMinLogLevel(): LogLevel
```

環境変数から最小ログレベルを取得する

**戻り値**: `LogLevel`

### resetMinLogLevelCache

```typescript
resetMinLogLevelCache(): void
```

キャッシュされた最小ログレベルをリセット（テスト用）

**戻り値**: `void`

### formatTimestamp

```typescript
formatTimestamp(date: Date): string
```

ISO8601形式のタイムスタンプを生成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| date | `Date` | はい |

**戻り値**: `string`

### shouldLog

```typescript
shouldLog(level: LogLevel, minLevel: LogLevel): boolean
```

ログレベルが最小レベル以上かどうかを判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| level | `LogLevel` | はい |
| minLevel | `LogLevel` | はい |

**戻り値**: `boolean`

### formatError

```typescript
formatError(error: Error | unknown): StructuredLogEntry["error"]
```

エラーオブジェクトを構造化された形式に変換する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `Error | unknown` | はい |

**戻り値**: `StructuredLogEntry["error"]`

### serializeLogEntry

```typescript
serializeLogEntry(entry: StructuredLogEntry): string
```

ログエントリをJSON文字列に変換する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| entry | `StructuredLogEntry` | はい |

**戻り値**: `string`

### formatReadableEntry

```typescript
formatReadableEntry(entry: StructuredLogEntry): string
```

ログエントリを読み取り可能な形式でフォーマットする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| entry | `StructuredLogEntry` | はい |

**戻り値**: `string`

### getDefaultLogger

```typescript
getDefaultLogger(): StructuredLogger
```

デフォルトロガーを取得する

**戻り値**: `StructuredLogger`

### resetDefaultLogger

```typescript
resetDefaultLogger(): void
```

デフォルトロガーをリセット（テスト用）

**戻り値**: `void`

### createLogger

```typescript
createLogger(context: LogContext | string, options?: Omit<StructuredLoggerOptions, "context">): StructuredLogger
```

指定されたコンテキストでロガーを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `LogContext | string` | はい |
| options | `Omit<StructuredLoggerOptions, "context">` | いいえ |

**戻り値**: `StructuredLogger`

### getSubagentLogger

```typescript
getSubagentLogger(): StructuredLogger
```

subagentsコンテキストのロガーを取得

**戻り値**: `StructuredLogger`

### getAgentTeamsLogger

```typescript
getAgentTeamsLogger(): StructuredLogger
```

agent-teamsコンテキストのロガーを取得

**戻り値**: `StructuredLogger`

### getStorageLogger

```typescript
getStorageLogger(): StructuredLogger
```

storageコンテキストのロガーを取得

**戻り値**: `StructuredLogger`

### logInfo

```typescript
logInfo(context: LogContext | string, operation: string, message: string, metadata?: Record<string, unknown>): void
```

クイックINFOログ

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `LogContext | string` | はい |
| operation | `string` | はい |
| message | `string` | はい |
| metadata | `Record<string, unknown>` | いいえ |

**戻り値**: `void`

### logWarn

```typescript
logWarn(context: LogContext | string, operation: string, message: string, metadata?: Record<string, unknown>): void
```

クイックWARNログ

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `LogContext | string` | はい |
| operation | `string` | はい |
| message | `string` | はい |
| metadata | `Record<string, unknown>` | いいえ |

**戻り値**: `void`

### logError

```typescript
logError(context: LogContext | string, operation: string, message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void
```

クイックERRORログ

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `LogContext | string` | はい |
| operation | `string` | はい |
| message | `string` | はい |
| error | `Error | unknown` | いいえ |
| metadata | `Record<string, unknown>` | いいえ |

**戻り値**: `void`

### logDebug

```typescript
logDebug(context: LogContext | string, operation: string, message: string, metadata?: Record<string, unknown>): void
```

クイックDEBUGログ

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `LogContext | string` | はい |
| operation | `string` | はい |
| message | `string` | はい |
| metadata | `Record<string, unknown>` | いいえ |

**戻り値**: `void`

## クラス

### StructuredLogger

構造化ロガークラス

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| minLevel | `LogLevel` | private |
| context | `LogContext | string` | private |
| correlationId | `string` | private |
| output | `"console" | "stdout" | "stderr"` | private |
| json | `boolean` | private |
| includeTimestamp | `boolean` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| child | `child(operation, additionalContext): ChildLogger` |
| log | `log(level, operation, message, metadata, error, durationMs): void` |
| outputEntry | `outputEntry(entry, level): void` |
| debug | `debug(operation, message, metadata): void` |
| info | `info(operation, message, metadata): void` |
| warn | `warn(operation, message, metadata): void` |
| error | `error(operation, message, error, metadata): void` |
| withTiming | `withTiming(operation, message, fn, metadata): Promise<T>` |
| withTimingSync | `withTimingSync(operation, message, fn, metadata): T` |

### ChildLogger

子ロガー - 操作名が固定されたロガー

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| debug | `debug(message, metadata): void` |
| info | `info(message, metadata): void` |
| warn | `warn(message, metadata): void` |
| error | `error(message, error, metadata): void` |
| withTiming | `withTiming(message, fn, metadata): Promise<T>` |
| withContext | `withContext(metadata): Record<string, unknown> | undefined` |

## インターフェース

### StructuredLogEntry

```typescript
interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  context: LogContext | string;
  operation: string;
  message: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  durationMs?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
```

構造化ログエントリのインターフェース

### StructuredLoggerOptions

```typescript
interface StructuredLoggerOptions {
  minLevel?: LogLevel;
  context?: LogContext | string;
  correlationId?: string;
  output?: "console" | "stdout" | "stderr";
  json?: boolean;
  includeTimestamp?: boolean;
}
```

ロガー設定オプション

## 型定義

### LogLevel

```typescript
type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"
```

ログレベル定義

### LogContext

```typescript
type LogContext = | "subagents"
  | "agent-teams"
  | "scheduler"
  | "storage"
  | "metrics"
  | "checkpoint"
  | "embedding"
  | "memory"
  | "skills"
  | "tools"
  | "extensions"
  | "general"
```

ログコンテキスト定義
モジュールやコンポーネントを識別するために使用

---
*自動生成: 2026-02-17T22:16:16.725Z*
