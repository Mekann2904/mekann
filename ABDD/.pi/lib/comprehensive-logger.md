---
title: comprehensive-logger
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# comprehensive-logger

## 概要

`comprehensive-logger` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'crypto': randomUUID
// from 'crypto': createHash
// from 'fs': existsSync, statSync
// from 'fs/promises': appendFile, mkdir
// from 'path': join, dirname
// ... and 3 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getLogger` | ロガーを取得 |
| 関数 | `resetLogger` | ロガーをリセット |
| クラス | `ComprehensiveLogger` | 包括的ロガー |

## 図解

### クラス図

```mermaid
classDiagram
  class ComprehensiveLogger {
    -config: LoggerConfig
    -buffer: LogEvent
    -sessionId: string
    -currentTaskId: string
    -currentOperationId: string
    -ensureLogDir()
    -startFlushTimer()
    +startSession()
    +endSession()
    +startTask()
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[comprehensive-logger]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    comprehensive_logger_config["comprehensive-logger-config"]
    comprehensive_logger_types["comprehensive-logger-types"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    crypto["crypto"]
    crypto["crypto"]
    fs["fs"]
    fs["fs"]
    path["path"]
  end
  main --> external
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant comprehensive_logger as "comprehensive-logger"
  participant crypto as "crypto"
  participant fs as "fs"
  participant path as "path"
  participant comprehensive_logger_config as "comprehensive-logger-config"
  participant comprehensive_logger_types as "comprehensive-logger-types"

  Caller->>comprehensive_logger: getLogger()
  comprehensive_logger->>crypto: API呼び出し
  crypto-->>comprehensive_logger: レスポンス
  comprehensive_logger->>comprehensive_logger_config: 内部関数呼び出し
  comprehensive_logger_config-->>comprehensive_logger: 結果
  comprehensive_logger-->>Caller: ComprehensiveLogger

  Caller->>comprehensive_logger: resetLogger()
  comprehensive_logger-->>Caller: void
```

## 関数

### getTimestamp

```typescript
getTimestamp(): string
```

**戻り値**: `string`

### getDateStr

```typescript
getDateStr(): string
```

**戻り値**: `string`

### hashString

```typescript
hashString(str: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| str | `string` | はい |

**戻り値**: `string`

### getLogger

```typescript
getLogger(): ComprehensiveLogger
```

ロガーを取得

**戻り値**: `ComprehensiveLogger`

### resetLogger

```typescript
resetLogger(): void
```

ロガーをリセット

**戻り値**: `void`

## クラス

### ComprehensiveLogger

包括的ロガー

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| config | `LoggerConfig` | private |
| buffer | `LogEvent[]` | private |
| sessionId | `string` | private |
| currentTaskId | `string` | private |
| currentOperationId | `string` | private |
| parentEventId | `string` | private |
| flushTimer | `ReturnType<typeof setInterval> | null` | private |
| eventCounter | `number` | private |
| errorCount | `number` | private |
| totalTokens | `number` | private |
| sessionStartTime | `number` | private |
| taskStartTime | `number` | private |
| operationStartTime | `number` | private |
| activeOperations | `Map<string, { startTime: number; target: string }>` | private |
| activeTasks | `Map<string, { startTime: number; userInput: string }>` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| ensureLogDir | `ensureLogDir(): Promise<void>` |
| startFlushTimer | `startFlushTimer(): void` |
| startSession | `startSession(data): string` |
| endSession | `endSession(exitReason): void` |
| startTask | `startTask(userInput, context): string` |
| endTask | `endTask(data): void` |
| startOperation | `startOperation(operationType, target, input, options): string` |
| endOperation | `endOperation(data): void` |
| logToolCall | `logToolCall(toolName, params, caller): string` |
| logToolResult | `logToolResult(toolName, result): void` |
| logToolError | `logToolError(toolName, error): void` |
| logLLMRequest | `logLLMRequest(data): string` |
| getSessionId | `getSessionId(): string` |
| getCurrentTaskId | `getCurrentTaskId(): string | undefined` |
| getCurrentOperationId | `getCurrentOperationId(): string | undefined` |
| getEventCount | `getEventCount(): number` |
| getErrorCount | `getErrorCount(): number` |
| getTotalTokens | `getTotalTokens(): number` |
| logLLMResponse | `logLLMResponse(data): void` |
| logStateChange | `logStateChange(data): void` |
| logMetricsSnapshot | `logMetricsSnapshot(data): void` |
| emit | `emit(event): void` |
| flush | `flush(): Promise<void>` |
| stopFlushTimer | `stopFlushTimer(): void` |
| getToolType | `getToolType(toolName): ToolType` |
| getSessionId | `getSessionId(): string` |
| getCurrentTaskId | `getCurrentTaskId(): string` |
| getCurrentOperationId | `getCurrentOperationId(): string` |
| getEventCount | `getEventCount(): number` |
| getErrorCount | `getErrorCount(): number` |
| getTotalTokens | `getTotalTokens(): number` |

---
*自動生成: 2026-02-18T18:06:17.492Z*
