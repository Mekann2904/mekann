---
title: comprehensive-logger.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [logger, events, tracing]
related: [comprehensive-logger-config.ts, comprehensive-logger-types.ts]
---

# comprehensive-logger.ts

包括的ログ収集システムのロガー実装。全操作を機械的に記録する。

## 概要

セッション、タスク、操作、ツール、LLM呼び出し、状態変更など全てのイベントを記録する。JSONLフォーマットでファイルに出力し、バッファリングとフラッシュ機能を提供する。

## クラス

### ComprehensiveLogger

メインロガークラス。

#### コンストラクタ

```typescript
constructor(config?: Partial<LoggerConfig>)
```

#### セッション管理

##### startSession

セッションを開始する。

```typescript
startSession(data: Omit<SessionStartEvent['data'], 'startupTimeMs'>): string
```

**戻り値**: セッションID

##### endSession

セッションを終了する。

```typescript
endSession(exitReason: SessionEndEvent['data']['exitReason']): void
```

#### タスク管理

##### startTask

タスクを開始する。

```typescript
startTask(
  userInput: string,
  context: TaskStartEvent['data']['context']
): string
```

**戻り値**: タスクID

##### endTask

タスクを終了する。

```typescript
endTask(data: Omit<TaskEndEvent['data'], 'durationMs'>): void
```

#### 操作管理

##### startOperation

操作を開始する。

```typescript
startOperation(
  operationType: OperationType,
  target: string,
  input: OperationStartEvent['data']['input'],
  options?: {
    strategy?: string;
    retryConfig?: OperationStartEvent['data']['retryConfig'];
  }
): string
```

**戻り値**: 操作ID

##### endOperation

操作を終了する。

```typescript
endOperation(data: Omit<OperationEndEvent['data'], 'durationMs'>): void
```

#### ツールログ

##### logToolCall

ツール呼び出しを記録する。

```typescript
logToolCall(
  toolName: string,
  params: Record<string, unknown>,
  caller: ToolCallEvent['data']['caller']
): string
```

**戻り値**: イベントID

##### logToolResult

ツール結果を記録する。

```typescript
logToolResult(
  toolName: string,
  result: Omit<ToolResultEvent['data'], 'toolName'>
): void
```

##### logToolError

ツールエラーを記録する。

```typescript
logToolError(
  toolName: string,
  error: Omit<ToolErrorEvent['data'], 'toolName'>
): void
```

#### LLMログ

##### logLLMRequest

LLMリクエストを記録する。

```typescript
logLLMRequest(data: {
  provider: string;
  model: string;
  systemPrompt: string;
  userMessages: Array<{ content: string }>;
  temperature?: number;
  maxTokens?: number;
  toolsAvailable: string[];
}): string
```

**戻り値**: イベントID

##### logLLMResponse

LLMレスポンスを記録する。

```typescript
logLLMResponse(data: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  responseLength: number;
  stopReason: LLMResponseEvent['data']['stopReason'];
  toolsCalled: Array<{ name: string; paramsSize: number }>;
}): void
```

#### 状態変更ログ

##### logStateChange

状態変更を記録する。

```typescript
logStateChange(data: {
  entityType: 'file' | 'storage' | 'memory' | 'config';
  entityPath: string;
  changeType: 'create' | 'update' | 'delete';
  beforeContent?: string;
  afterContent?: string;
  diff?: { additions: number; deletions: number; hunks: number };
}): void
```

#### メトリクス

##### logMetricsSnapshot

メトリクススナップショットを記録する。

```typescript
logMetricsSnapshot(data: MetricsSnapshotEvent['data']): void
```

#### フラッシュ

##### flush

バッファをファイルにフラッシュする。

```typescript
async flush(): Promise<void>
```

#### ユーティリティ

##### getSessionId

セッションIDを取得する。

```typescript
getSessionId(): string
```

##### getCurrentTaskId

現在のタスクIDを取得する。

```typescript
getCurrentTaskId(): string
```

##### getCurrentOperationId

現在の操作IDを取得する。

```typescript
getCurrentOperationId(): string
```

##### getEventCount

イベント数を取得する。

```typescript
getEventCount(): number
```

##### getErrorCount

エラー数を取得する。

```typescript
getErrorCount(): number
```

##### getTotalTokens

総トークン数を取得する。

```typescript
getTotalTokens(): number
```

## 関数

### getLogger

シングルトンロガーインスタンスを取得する。

```typescript
function getLogger(): ComprehensiveLogger
```

### resetLogger

シングルトンロガーをリセットする。

```typescript
function resetLogger(): void
```

## 使用例

```typescript
import { getLogger, ComprehensiveLogger } from "./lib/comprehensive-logger.js";

// シングルトン使用
const logger = getLogger();

// セッション開始
logger.startSession({
  piVersion: "1.0.0",
  nodeVersion: process.version,
  platform: process.platform,
  cwd: process.cwd(),
  envKeys: Object.keys(process.env),
  configHash: "abc123",
});

// タスク開始
const taskId = logger.startTask("ユーザーの質問", {
  filesReferenced: ["file1.ts"],
  skillsLoaded: ["git-workflow"],
  teamsAvailable: ["team1"],
});

// 操作開始
const opId = logger.startOperation("subagent_run", "researcher", {
  task: "調査タスク",
  params: { depth: "deep" },
});

// ツールログ
const toolEventId = logger.logToolCall("read", { path: "file.ts" }, {
  file: "main.ts",
  line: 10,
  function: "processFile",
});

// ツール結果
logger.logToolResult("read", {
  status: "success",
  durationMs: 50,
  outputType: "inline",
  output: "file contents...",
  outputSize: 1000,
});

// 操作終了
logger.endOperation({
  status: "success",
  tokensUsed: 500,
  outputLength: 1000,
  childOperations: 0,
  toolCalls: 1,
});

// タスク終了
logger.endTask({
  status: "success",
  operationsCount: 1,
  toolsCount: 1,
  tokensUsed: 500,
  filesCreated: [],
  filesModified: [],
  filesDeleted: [],
  commandsExecuted: [],
  summary: "タスク完了",
  errors: [],
});

// セッション終了
logger.endSession("normal");
```

## ファイルフォーマット

ログは`{logDir}/events-{YYYY-MM-DD}.jsonl`にJSONL形式で出力される。

ファイルサイズが`maxFileSizeMB`を超えるとローテーションされる。

## 関連ファイル

- `.pi/lib/comprehensive-logger-config.ts` - 設定管理
- `.pi/lib/comprehensive-logger-types.ts` - 型定義
