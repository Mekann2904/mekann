---
title: Structured Logger
category: reference
audience: developer
last_updated: 2026-02-18
tags: [logging, structured-output, debug]
related: []
---

# Structured Logger

統一フォーマットによる構造化ログ出力を提供するユーティリティ。

## 概要

ログレベル、コンテキスト、操作名、メタデータを含む一貫した構造化されたログを生成する。

### Feature Flag

環境変数 `PI_LOG_LEVEL` で制御:
- `"debug"`: 全レベル出力
- `"info"`: INFO以上を出力 (default)
- `"warn"`: WARN以上を出力
- `"error"`: ERRORのみ出力

## Types

### LogLevel

```typescript
type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
```

### LogContext

```typescript
type LogContext =
  | "subagents"
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
  | "general";
```

### StructuredLogEntry

```typescript
interface StructuredLogEntry {
  /** ISO8601形式のタイムスタンプ */
  timestamp: string;
  /** ログレベル */
  level: LogLevel;
  /** コンテキスト（モジュール名） */
  context: LogContext | string;
  /** 操作名（関数名など） */
  operation: string;
  /** ログメッセージ */
  message: string;
  /** 追加のメタデータ */
  metadata?: Record<string, unknown>;
  /** 相関ID（トレース用） */
  correlationId?: string;
  /** 実行時間（ミリ秒） */
  durationMs?: number;
  /** エラー情報 */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
```

### StructuredLoggerOptions

```typescript
interface StructuredLoggerOptions {
  /** 最小ログレベル */
  minLevel?: LogLevel;
  /** コンテキスト（デフォルト） */
  context?: LogContext | string;
  /** 相関ID */
  correlationId?: string;
  /** 出力先（デフォルト: console） */
  output?: "console" | "stdout" | "stderr";
  /** JSONフォーマットで出力するか */
  json?: boolean;
  /** タイムスタンプを含めるか */
  includeTimestamp?: boolean;
}
```

## StructuredLogger Class

構造化ロガーのメインクラス。

### Constructor

```typescript
constructor(options: StructuredLoggerOptions = {})
```

### Methods

#### child()

子ロガーを作成する（コンテキストを継承）。

```typescript
child(operation: string, additionalContext?: LogContext | string): ChildLogger
```

#### debug()

DEBUGレベルのログを出力。

```typescript
debug(operation: string, message: string, metadata?: Record<string, unknown>): void
```

#### info()

INFOレベルのログを出力。

```typescript
info(operation: string, message: string, metadata?: Record<string, unknown>): void
```

#### warn()

WARNレベルのログを出力。

```typescript
warn(operation: string, message: string, metadata?: Record<string, unknown>): void
```

#### error()

ERRORレベルのログを出力。

```typescript
error(
  operation: string,
  message: string,
  error?: Error | unknown,
  metadata?: Record<string, unknown>
): void
```

#### withTiming()

操作の実行時間を測定してログを出力。

```typescript
async withTiming<T>(
  operation: string,
  message: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T>
```

#### withTimingSync()

同期操作の実行時間を測定してログを出力。

```typescript
withTimingSync<T>(
  operation: string,
  message: string,
  fn: () => T,
  metadata?: Record<string, unknown>
): T
```

## ChildLogger Class

操作名が固定されたロガー。

### Methods

- `debug(message: string, metadata?)` - DEBUGログ
- `info(message: string, metadata?)` - INFOログ
- `warn(message: string, metadata?)` - WARNログ
- `error(message: string, error?, metadata?)` - ERRORログ
- `withTiming(message, fn, metadata?)` - 実行時間測定

## Utility Functions

### getMinLogLevel()

環境変数から最小ログレベルを取得する。

```typescript
function getMinLogLevel(): LogLevel
```

### resetMinLogLevelCache()

キャッシュされた最小ログレベルをリセット（テスト用）。

```typescript
function resetMinLogLevelCache(): void
```

### formatTimestamp()

ISO8601形式のタイムスタンプを生成する。

```typescript
function formatTimestamp(date?: Date): string
```

### shouldLog()

ログレベルが最小レベル以上かどうかを判定する。

```typescript
function shouldLog(level: LogLevel, minLevel: LogLevel): boolean
```

### formatError()

エラーオブジェクトを構造化された形式に変換する。

```typescript
function formatError(error: Error | unknown): StructuredLogEntry["error"]
```

### serializeLogEntry()

ログエントリをJSON文字列に変換する。

```typescript
function serializeLogEntry(entry: StructuredLogEntry): string
```

### formatReadableEntry()

ログエントリを読み取り可能な形式でフォーマットする。

```typescript
function formatReadableEntry(entry: StructuredLogEntry): string
```

## Factory Functions

### getDefaultLogger()

デフォルトロガーを取得する。

```typescript
function getDefaultLogger(): StructuredLogger
```

### resetDefaultLogger()

デフォルトロガーをリセット（テスト用）。

```typescript
function resetDefaultLogger(): void
```

### createLogger()

指定されたコンテキストでロガーを作成する。

```typescript
function createLogger(
  context: LogContext | string,
  options?: Omit<StructuredLoggerOptions, "context">
): StructuredLogger
```

### getSubagentLogger()

subagentsコンテキストのロガーを取得。

```typescript
function getSubagentLogger(): StructuredLogger
```

### getAgentTeamsLogger()

agent-teamsコンテキストのロガーを取得。

```typescript
function getAgentTeamsLogger(): StructuredLogger
```

### getStorageLogger()

storageコンテキストのロガーを取得。

```typescript
function getStorageLogger(): StructuredLogger
```

## Quick Logging Functions

クイックな単発ログ出力用。

### logInfo()

```typescript
function logInfo(
  context: LogContext | string,
  operation: string,
  message: string,
  metadata?: Record<string, unknown>
): void
```

### logWarn()

```typescript
function logWarn(
  context: LogContext | string,
  operation: string,
  message: string,
  metadata?: Record<string, unknown>
): void
```

### logError()

```typescript
function logError(
  context: LogContext | string,
  operation: string,
  message: string,
  error?: Error | unknown,
  metadata?: Record<string, unknown>
): void
```

### logDebug()

```typescript
function logDebug(
  context: LogContext | string,
  operation: string,
  message: string,
  metadata?: Record<string, unknown>
): void
```

## 使用例

```typescript
// 基本的な使用
const logger = createLogger("subagents");
logger.info("execute", "Starting subagent execution", { agentId: "agent-1" });

// 子ロガーの使用
const childLogger = logger.child("processTask", "task-handler");
childLogger.info("Processing task", { taskId: "task-123" });

// 実行時間の測定
const result = await logger.withTiming("query", "Database query", async () => {
  return await db.query("SELECT * FROM users");
});

// エラーログ
try {
  await riskyOperation();
} catch (error) {
  logger.error("riskyOperation", "Operation failed", error);
}
```
