---
title: comprehensive-logger-types
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# comprehensive-logger-types

## 概要

`comprehensive-logger-types` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| インターフェース | `BaseEvent` | - |
| インターフェース | `SessionStartEvent` | - |
| インターフェース | `SessionEndEvent` | - |
| インターフェース | `TaskStartEvent` | - |
| インターフェース | `TaskEndEvent` | - |
| インターフェース | `OperationStartEvent` | - |
| インターフェース | `OperationEndEvent` | - |
| インターフェース | `ToolCallEvent` | - |
| インターフェース | `ToolResultEvent` | - |
| インターフェース | `ToolErrorEvent` | - |
| インターフェース | `LLMRequestEvent` | - |
| インターフェース | `LLMResponseEvent` | - |
| インターフェース | `LLMErrorEvent` | - |
| インターフェース | `UserInputEvent` | - |
| インターフェース | `UserFeedbackEvent` | - |
| インターフェース | `ConfigLoadEvent` | - |
| インターフェース | `StateChangeEvent` | - |
| インターフェース | `MetricsSnapshotEvent` | - |
| インターフェース | `LoggerConfig` | - |
| 型 | `EventType` | 包括的ログ収集システム - 型定義 |
| 型 | `ComponentType` | - |
| 型 | `ToolType` | - |
| 型 | `Status` | - |
| 型 | `OperationType` | - |
| 型 | `LogEvent` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class BaseEvent {
    <<interface>>
    +eventId: string
    +eventType: EventType
    +sessionId: string
    +taskId: string
    +operationId: string
  }
  class SessionStartEvent {
    <<interface>>
    +eventType: session_start
    +data: piVersionstringnodeVersionstringplatformstringcwdstringenvKeysstring[]configHashstringstartupTimeMsnumber
  }
  class SessionEndEvent {
    <<interface>>
    +eventType: session_end
    +data: durationMsnumbertaskCountnumbererrorCountnumbertotalTokensUsednumberexitReasonnormalerroruser_interrupttimeout
  }
  class TaskStartEvent {
    <<interface>>
    +eventType: task_start
    +data: userInputstringinputTypetextvoicefilecontextfilesReferencedstring[]skillsLoadedstring[]teamsAvailablestring[]intentstring
  }
  class TaskEndEvent {
    <<interface>>
    +eventType: task_end
    +data: durationMsnumberstatusStatusoperationsCountnumbertoolsCountnumbertokensUsednumberfilesCreatedstring[]filesModifiedstring[]filesDeletedstring[]commandsExecutedstring[]summarystringerrorsArray<eventIdstringmessagestringtypestring>
  }
  class OperationStartEvent {
    <<interface>>
    +eventType: operation_start
    +data: operationTypeOperationTypetargetstringinputtaskstringparamsRecord<stringunknown>strategystringretryConfigmaxRetriesnumberbackoffMsnumber
  }
  class OperationEndEvent {
    <<interface>>
    +eventType: operation_end
    +data: durationMsnumberstatusStatustokensUsednumberoutputLengthnumberoutputFilestringchildOperationsnumbertoolCallsnumbererrortypestringmessagestringstackstring
  }
  class ToolCallEvent {
    <<interface>>
    +eventType: tool_call
    +data: toolNamestringtoolTypeToolTypeparamsRecord<stringunknown>callerfilestringlinenumberfunctionstringenvironmentcwdstringshellstring
  }
  class ToolResultEvent {
    <<interface>>
    +eventType: tool_result
    +data: toolNamestringstatussuccesserrorpartialdurationMsnumberoutputTypeinlinefiletruncatedoutputstringoutputHashstringoutputSizenumberexitCodenumbermimeTypestring
  }
  class ToolErrorEvent {
    <<interface>>
    +eventType: tool_error
    +data: toolNamestringerrorTypevalidationexecutiontimeoutpermissionunknownerrorMessagestringerrorStackstringrecoveryAttemptedbooleanrecoveryMethodstringrecoverySuccessfulbooleanparamsRecord<stringunknown>partialOutputstring
  }
  class LLMRequestEvent {
    <<interface>>
    +eventType: llm_request
    +data: providerstringmodelstringsystemPromptLengthnumbersystemPromptHashstringuserMessageCountnumberuserMessageLengthnumbertemperaturenumbermaxTokensnumbercontextWindowUsednumbertoolsAvailablestring[]
  }
  class LLMResponseEvent {
    <<interface>>
    +eventType: llm_response
    +data: providerstringmodelstringinputTokensnumberoutputTokensnumbertotalTokensnumberdurationMsnumberresponseLengthnumberstopReasonend_turnmax_tokenstool_useerrortoolsCalledArray<namestringparamsSizenumber>
  }
  class LLMErrorEvent {
    <<interface>>
    +eventType: llm_error
    +data: providerstringmodelstringerrorTyperate_limittimeoutcontext_too_longapi_errorunknownerrorMessagestringretryAttemptnumberretryAfterMsnumber
  }
  class UserInputEvent {
    <<interface>>
    +eventType: user_input
    +data: inputstringinputTypetextvoicefilemetadatasourcestringtimestampstring
  }
  class UserFeedbackEvent {
    <<interface>>
    +eventType: user_feedback
    +data: feedbackTypeapprovalrejectioncorrectionclarificationtargetEventIdstringcontentstring
  }
  class ConfigLoadEvent {
    <<interface>>
    +eventType: config_load
    +data: configTypesystemprojectuserconfigPathstringconfigHashstringkeysLoadedstring[]overridesRecord<stringboolean>
  }
  class StateChangeEvent {
    <<interface>>
    +eventType: state_change
    +data: entityTypefilestoragememoryconfigentityPathstringchangeTypecreateupdatedeletediffadditionsnumberdeletionsnumberhunksnumberbeforeHashstringafterHashstring
  }
  class MetricsSnapshotEvent {
    <<interface>>
    +eventType: metrics_snapshot
    +data: memoryUsageMBnumbercpuPercentnumbereventsTotalnumbertasksCompletednumberoperationsCompletednumbertoolCallsTotalnumbertokensTotalnumbererrorRatenumberavgResponseTimeMsnumberp95ResponseTimeMsnumber
  }
  class LoggerConfig {
    <<interface>>
    +logDir: string
    +enabled: boolean
    +bufferSize: number
    +flushIntervalMs: number
    +maxFileSizeMB: number
  }
```

## インターフェース

### BaseEvent

```typescript
interface BaseEvent {
  eventId: string;
  eventType: EventType;
  sessionId: string;
  taskId: string;
  operationId: string;
  parentEventId?: string;
  timestamp: string;
  component: {
    type: ComponentType;
    name: string;
    version?: string;
    filePath?: string;
  };
}
```

### SessionStartEvent

```typescript
interface SessionStartEvent {
  eventType: 'session_start';
  data: {
    piVersion: string;
    nodeVersion: string;
    platform: string;
    cwd: string;
    envKeys: string[];
    configHash: string;
    startupTimeMs: number;
  };
}
```

### SessionEndEvent

```typescript
interface SessionEndEvent {
  eventType: 'session_end';
  data: {
    durationMs: number;
    taskCount: number;
    errorCount: number;
    totalTokensUsed: number;
    exitReason: 'normal' | 'error' | 'user_interrupt' | 'timeout';
  };
}
```

### TaskStartEvent

```typescript
interface TaskStartEvent {
  eventType: 'task_start';
  data: {
    userInput: string;
    inputType: 'text' | 'voice' | 'file';
    context: {
      filesReferenced: string[];
      skillsLoaded: string[];
      teamsAvailable: string[];
    };
    intent?: string;
  };
}
```

### TaskEndEvent

```typescript
interface TaskEndEvent {
  eventType: 'task_end';
  data: {
    durationMs: number;
    status: Status;
    operationsCount: number;
    toolsCount: number;
    tokensUsed: number;
    filesCreated: string[];
    filesModified: string[];
    filesDeleted: string[];
    commandsExecuted: string[];
    summary: string;
    errors: Array<{
      eventId: string;
      message: string;
      type: string;
    }>;
  };
}
```

### OperationStartEvent

```typescript
interface OperationStartEvent {
  eventType: 'operation_start';
  data: {
    operationType: OperationType;
    target: string;
    input: {
      task: string;
      params: Record<string, unknown>;
    };
    strategy?: string;
    retryConfig?: {
      maxRetries: number;
      backoffMs: number;
    };
  };
}
```

### OperationEndEvent

```typescript
interface OperationEndEvent {
  eventType: 'operation_end';
  data: {
    durationMs: number;
    status: Status;
    tokensUsed: number;
    outputLength: number;
    outputFile?: string;
    childOperations: number;
    toolCalls: number;
    error?: {
      type: string;
      message: string;
      stack: string;
    };
  };
}
```

### ToolCallEvent

```typescript
interface ToolCallEvent {
  eventType: 'tool_call';
  data: {
    toolName: string;
    toolType: ToolType;
    params: Record<string, unknown>;
    caller: {
      file: string;
      line: number;
      function: string;
    };
    environment: {
      cwd: string;
      shell?: string;
    };
  };
}
```

### ToolResultEvent

```typescript
interface ToolResultEvent {
  eventType: 'tool_result';
  data: {
    toolName: string;
    status: 'success' | 'error' | 'partial';
    durationMs: number;
    outputType: 'inline' | 'file' | 'truncated';
    output: string;
    outputHash?: string;
    outputSize: number;
    exitCode?: number;
    mimeType?: string;
  };
}
```

### ToolErrorEvent

```typescript
interface ToolErrorEvent {
  eventType: 'tool_error';
  data: {
    toolName: string;
    errorType: 'validation' | 'execution' | 'timeout' | 'permission' | 'unknown';
    errorMessage: string;
    errorStack?: string;
    recoveryAttempted: boolean;
    recoveryMethod?: string;
    recoverySuccessful?: boolean;
    params: Record<string, unknown>;
    partialOutput?: string;
  };
}
```

### LLMRequestEvent

```typescript
interface LLMRequestEvent {
  eventType: 'llm_request';
  data: {
    provider: string;
    model: string;
    systemPromptLength: number;
    systemPromptHash: string;
    userMessageCount: number;
    userMessageLength: number;
    temperature?: number;
    maxTokens?: number;
    contextWindowUsed: number;
    toolsAvailable: string[];
  };
}
```

### LLMResponseEvent

```typescript
interface LLMResponseEvent {
  eventType: 'llm_response';
  data: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    durationMs: number;
    responseLength: number;
    stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'error';
    toolsCalled: Array<{
      name: string;
      paramsSize: number;
    }>;
  };
}
```

### LLMErrorEvent

```typescript
interface LLMErrorEvent {
  eventType: 'llm_error';
  data: {
    provider: string;
    model: string;
    errorType: 'rate_limit' | 'timeout' | 'context_too_long' | 'api_error' | 'unknown';
    errorMessage: string;
    retryAttempt?: number;
    retryAfterMs?: number;
  };
}
```

### UserInputEvent

```typescript
interface UserInputEvent {
  eventType: 'user_input';
  data: {
    input: string;
    inputType: 'text' | 'voice' | 'file';
    metadata?: {
      source?: string;
      timestamp?: string;
    };
  };
}
```

### UserFeedbackEvent

```typescript
interface UserFeedbackEvent {
  eventType: 'user_feedback';
  data: {
    feedbackType: 'approval' | 'rejection' | 'correction' | 'clarification';
    targetEventId: string;
    content: string;
  };
}
```

### ConfigLoadEvent

```typescript
interface ConfigLoadEvent {
  eventType: 'config_load';
  data: {
    configType: 'system' | 'project' | 'user';
    configPath: string;
    configHash: string;
    keysLoaded: string[];
    overrides: Record<string, boolean>;
  };
}
```

### StateChangeEvent

```typescript
interface StateChangeEvent {
  eventType: 'state_change';
  data: {
    entityType: 'file' | 'storage' | 'memory' | 'config';
    entityPath: string;
    changeType: 'create' | 'update' | 'delete';
    diff?: {
      additions: number;
      deletions: number;
      hunks: number;
    };
    beforeHash?: string;
    afterHash?: string;
  };
}
```

### MetricsSnapshotEvent

```typescript
interface MetricsSnapshotEvent {
  eventType: 'metrics_snapshot';
  data: {
    memoryUsageMB: number;
    cpuPercent: number;
    eventsTotal: number;
    tasksCompleted: number;
    operationsCompleted: number;
    toolCallsTotal: number;
    tokensTotal: number;
    errorRate: number;
    avgResponseTimeMs: number;
    p95ResponseTimeMs: number;
  };
}
```

### LoggerConfig

```typescript
interface LoggerConfig {
  logDir: string;
  enabled: boolean;
  bufferSize: number;
  flushIntervalMs: number;
  maxFileSizeMB: number;
  retentionDays: number;
  environment: 'development' | 'production' | 'test';
  minLogLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

## 型定義

### EventType

```typescript
type EventType = | 'session_start'
  | 'session_end'
  | 'task_start'
  | 'task_end'
  | 'operation_start'
  | 'operation_end'
  // ツール
  | 'tool_call'
  | 'tool_result'
  | 'tool_error'
  // LLM
  | 'llm_request'
  | 'llm_response'
  | 'llm_error'
  // ユーザー
  | 'user_input'
  | 'user_feedback'
  // システム
  | 'config_load'
  | 'state_change'
  | 'metrics_snapshot'
```

包括的ログ収集システム - 型定義

ファイル: .pi/lib/comprehensive-logger-types.ts
目的: 全イベントの型定義

### ComponentType

```typescript
type ComponentType = 'extension' | 'subagent' | 'team' | 'skill' | 'tool'
```

### ToolType

```typescript
type ToolType = 'builtin' | 'extension' | 'dynamic'
```

### Status

```typescript
type Status = 'pending' | 'running' | 'success' | 'failure' | 'timeout' | 'partial' | 'cancelled'
```

### OperationType

```typescript
type OperationType = 'subagent_run' | 'team_run' | 'loop_run' | 'direct'
```

### LogEvent

```typescript
type LogEvent = | SessionStartEvent
  | SessionEndEvent
  | TaskStartEvent
  | TaskEndEvent
  | OperationStartEvent
  | OperationEndEvent
  | ToolCallEvent
  | ToolResultEvent
  | ToolErrorEvent
  | LLMRequestEvent
  | LLMResponseEvent
  | LLMErrorEvent
  | UserInputEvent
  | UserFeedbackEvent
  | ConfigLoadEvent
  | StateChangeEvent
  | MetricsSnapshotEvent
```

---
*自動生成: 2026-02-17T22:16:16.615Z*
