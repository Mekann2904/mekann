---
title: task-auto-executor
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# task-auto-executor

## 概要

`task-auto-executor` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': existsSync, readFileSync, writeFileSync, ...
// from 'node:path': join
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from './ul-workflow.js': getInstanceId, isProcessAlive, extractPidFromInstanceId
// ... and 2 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `isAutoExecutorEnabled` | - |
| 関数 | `getAutoExecutorStatus` | - |
| 関数 | `toggleAutoExecutor` | - |
| 関数 | `registerTaskAutoExecutor` | - |

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### task_run_next

Execute the next pending task from the task queue (highest priority first)

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"
  participant LLM as "LLM"
  participant Executor as "Executor"

  User->>System: Execute the next pending task from the task queue (highes...
  System->>Storage: loadStorage
  Storage->>Internal: existsSync
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: getNextPendingTask
  Internal->>Internal: ID取得
  Internal->>Unresolved: storage.tasks.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>LLM: PID抽出
  LLM->>Unresolved: instanceId.match (node_modules/typescript/lib/lib.es5.d.ts)
  LLM->>Unresolved: Number (node_modules/typescript/lib/lib.es5.d.ts)
  LLM->>Unresolved: Number.isInteger (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Executor: プロセス生存確認
  Executor->>Unresolved: process.kill (node_modules/@types/node/process.d.ts)
  Internal->>Unresolved: candidates.sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: new Date(a.createdAt).getTime (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: storage.tasks.findIndex (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Storage: saveStorage
  Storage->>Internal: mkdirSync
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Storage: saveConfig
  System-->>User: 結果

```

### task_queue_show

Display the current task queue with priorities and counts

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"
  participant LLM as "LLM"
  participant Executor as "Executor"

  User->>System: Display the current task queue with priorities and counts
  System->>Storage: loadStorage
  Storage->>Internal: existsSync
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: storage.tasks.filter (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: todoTasks.forEach (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: grouped[t.priority].push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: priority.toUpperCase (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: t.description.slice (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: getNextPendingTask
  Internal->>Internal: ID取得
  Internal->>LLM: PID抽出
  LLM->>Unresolved: instanceId.match (node_modules/typescript/lib/lib.es5.d.ts)
  LLM->>Unresolved: Number (node_modules/typescript/lib/lib.es5.d.ts)
  LLM->>Unresolved: Number.isInteger (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Executor: プロセス生存確認
  Executor->>Unresolved: process.kill (node_modules/@types/node/process.d.ts)
  Internal->>Unresolved: candidates.sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: new Date(a.createdAt).getTime (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### task_auto_executor_toggle

Enable or disable automatic task notification when idle

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"

  User->>System: Enable or disable automatic task notification when idle
  System->>Storage: saveConfig
  Storage->>Internal: existsSync
  Storage->>Internal: mkdirSync
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### task_auto_executor_status

Show current auto executor configuration and status

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Internal as "Internal"
  participant Storage as "Storage"
  participant Unresolved as "Unresolved"

  User->>System: Show current auto executor configuration and status
  System->>Internal: getAutoExecutorStatus
  Internal->>Storage: loadStorage
  Storage->>Internal: existsSync
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: storage.tasks.filter (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class Task {
    <<interface>>
    +id: string
    +title: string
    +description: string
    +status: TaskStatus
    +priority: TaskPriority
  }
  class TaskStorage {
    <<interface>>
    +tasks: Task
    +currentTaskId: string
  }
  class AutoExecutorConfig {
    <<interface>>
    +enabled: boolean
    +autoRun: boolean
    +currentTaskId: string
    +maxRetries: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[task-auto-executor]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    ul_workflow["ul-workflow"]
    comprehensive_logger["comprehensive-logger"]
    comprehensive_logger_types["comprehensive-logger-types"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  getAutoExecutorStatus["getAutoExecutorStatus()"]
  getNextPendingTask["getNextPendingTask()"]
  isAutoExecutorEnabled["isAutoExecutorEnabled()"]
  loadConfig["loadConfig()"]
  loadStorage["loadStorage()"]
  registerTaskAutoExecutor["registerTaskAutoExecutor()"]
  saveConfig["saveConfig()"]
  saveStorage["saveStorage()"]
  toggleAutoExecutor["toggleAutoExecutor()"]
  getAutoExecutorStatus --> loadStorage
  registerTaskAutoExecutor --> getAutoExecutorStatus
  registerTaskAutoExecutor --> getNextPendingTask
  registerTaskAutoExecutor --> loadConfig
  registerTaskAutoExecutor --> loadStorage
  registerTaskAutoExecutor --> saveConfig
  registerTaskAutoExecutor --> saveStorage
  toggleAutoExecutor --> saveConfig
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant task_auto_executor as "task-auto-executor"
  participant mariozechner as "@mariozechner"
  participant ul_workflow as "ul-workflow"
  participant comprehensive_logger as "comprehensive-logger"

  Caller->>task_auto_executor: isAutoExecutorEnabled()
  task_auto_executor->>mariozechner: API呼び出し
  mariozechner-->>task_auto_executor: レスポンス
  task_auto_executor->>ul_workflow: 内部関数呼び出し
  ul_workflow-->>task_auto_executor: 結果
  task_auto_executor-->>Caller: boolean

  Caller->>task_auto_executor: getAutoExecutorStatus()
  task_auto_executor-->>Caller: AutoExecutorConfig
```

## 関数

### loadStorage

```typescript
loadStorage(): TaskStorage
```

**戻り値**: `TaskStorage`

### saveStorage

```typescript
saveStorage(storage: TaskStorage): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `TaskStorage` | はい |

**戻り値**: `void`

### loadConfig

```typescript
loadConfig(): void
```

**戻り値**: `void`

### saveConfig

```typescript
saveConfig(): void
```

**戻り値**: `void`

### getNextPendingTask

```typescript
getNextPendingTask(storage: TaskStorage): Task | null
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `TaskStorage` | はい |

**戻り値**: `Task | null`

### isAutoExecutorEnabled

```typescript
isAutoExecutorEnabled(): boolean
```

**戻り値**: `boolean`

### getAutoExecutorStatus

```typescript
getAutoExecutorStatus(): AutoExecutorConfig & { pendingCount: number }
```

**戻り値**: `AutoExecutorConfig & { pendingCount: number }`

### toggleAutoExecutor

```typescript
toggleAutoExecutor(enabled?: boolean): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| enabled | `boolean` | いいえ |

**戻り値**: `void`

### registerTaskAutoExecutor

```typescript
registerTaskAutoExecutor(pi: ExtensionAPI): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

## インターフェース

### Task

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate?: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  parentTaskId?: string;
  ownerInstanceId?: string;
  claimedAt?: string;
}
```

### TaskStorage

```typescript
interface TaskStorage {
  tasks: Task[];
  currentTaskId?: string;
}
```

### AutoExecutorConfig

```typescript
interface AutoExecutorConfig {
  enabled: boolean;
  autoRun: boolean;
  currentTaskId?: string;
  maxRetries: number;
}
```

## 型定義

### TaskPriority

```typescript
type TaskPriority = "low" | "medium" | "high" | "urgent"
```

### TaskStatus

```typescript
type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled" | "failed"
```

---
*自動生成: 2026-02-28T13:55:22.947Z*
