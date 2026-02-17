---
title: checkpoint-manager
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# checkpoint-manager

## 概要

`checkpoint-manager` モジュールのAPIリファレンス。

## インポート

```typescript
import { existsSync, mkdirSync, readdirSync... } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `initCheckpointManager` | Initialize the checkpoint manager. |
| 関数 | `getCheckpointManager` | Get checkpoint manager instance (initializes if ne |
| 関数 | `resetCheckpointManager` | Reset checkpoint manager state (for testing). |
| 関数 | `isCheckpointManagerInitialized` | Check if checkpoint manager is initialized. |
| 関数 | `getCheckpointDir` | Get checkpoint directory path. |
| 関数 | `getCheckpointConfigFromEnv` | Get checkpoint manager config from environment var |
| インターフェース | `Checkpoint` | Checkpoint state for a long-running task. |
| インターフェース | `CheckpointSaveResult` | Result of checkpoint save operation. |
| インターフェース | `PreemptionResult` | Result of preemption operation. |
| インターフェース | `CheckpointManagerConfig` | Checkpoint manager configuration. |
| インターフェース | `CheckpointStats` | Checkpoint statistics. |
| 型 | `CheckpointSource` | Source type for checkpointed tasks. |
| 型 | `CheckpointPriority` | Task priority for checkpoint ordering. |

## 図解

### クラス図

```mermaid
classDiagram
  class Checkpoint {
    <<interface>>
    +id: string
    +taskId: string
    +source: CheckpointSource
    +provider: string
    +model: string
  }
  class CheckpointSaveResult {
    <<interface>>
    +success: boolean
    +checkpointId: string
    +path: string
    +error: string
  }
  class PreemptionResult {
    <<interface>>
    +success: boolean
    +checkpointId: string
    +error: string
    +resumedFromCheckpoint: boolean
  }
  class CheckpointManagerConfig {
    <<interface>>
    +checkpointDir: string
    +defaultTtlMs: number
    +maxCheckpoints: number
    +cleanupIntervalMs: number
  }
  class CheckpointStats {
    <<interface>>
    +totalCount: number
    +totalSizeBytes: number
    +oldestCreatedAt: numbernull
    +newestCreatedAt: numbernull
    +bySource: Record<CheckpointSourcenumber>
  }
```

### 関数フロー

```mermaid
flowchart TD
  initCheckpointManager["initCheckpointManager()"]
  getCheckpointManager["getCheckpointManager()"]
  resetCheckpointManager["resetCheckpointManager()"]
  isCheckpointManagerInitialized["isCheckpointManagerInitialized()"]
  getCheckpointDir["getCheckpointDir()"]
  getCheckpointConfigFromEnv["getCheckpointConfigFromEnv()"]
  initCheckpointManager -.-> getCheckpointManager
  getCheckpointManager -.-> resetCheckpointManager
  resetCheckpointManager -.-> isCheckpointManagerInitialized
  isCheckpointManagerInitialized -.-> getCheckpointDir
  getCheckpointDir -.-> getCheckpointConfigFromEnv
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant checkpoint_manager as checkpoint-manager

  Caller->>checkpoint_manager: initCheckpointManager()
  checkpoint_manager-->>Caller: void

  Caller->>checkpoint_manager: getCheckpointManager()
  checkpoint_manager-->>Caller: {
  save: (checkpoint: Omit<Checkpoint, "id" | "createdAt"> & { id?: string }) => Promise<CheckpointSaveResult>;
  load: (taskId: string) => Promise<Checkpoint | null>;
  delete: (taskId: string) => Promise<boolean>;
  listExpired: () => Promise<Checkpoint[]>;
  cleanup: () => Promise<number>;
  getStats: () => CheckpointStats;
}
```

## 関数

### resolveCheckpointDir

```typescript
resolveCheckpointDir(baseDir: string): string
```

Resolve checkpoint directory path.
Supports both relative and absolute paths.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| baseDir | `string` | はい |

**戻り値**: `string`

### ensureCheckpointDir

```typescript
ensureCheckpointDir(dir: string): void
```

Ensure checkpoint directory exists.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| dir | `string` | はい |

**戻り値**: `void`

### generateCheckpointId

```typescript
generateCheckpointId(taskId: string): string
```

Generate a unique checkpoint ID.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| taskId | `string` | はい |

**戻り値**: `string`

### getCheckpointPath

```typescript
getCheckpointPath(dir: string, checkpointId: string): string
```

Get checkpoint file path from checkpoint ID.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| dir | `string` | はい |
| checkpointId | `string` | はい |

**戻り値**: `string`

### parseCheckpointFile

```typescript
parseCheckpointFile(filePath: string): Checkpoint | null
```

Parse checkpoint file.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| filePath | `string` | はい |

**戻り値**: `Checkpoint | null`

### isCheckpointExpired

```typescript
isCheckpointExpired(checkpoint: Checkpoint, nowMs: number): boolean
```

Check if checkpoint is expired.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| checkpoint | `Checkpoint` | はい |
| nowMs | `number` | はい |

**戻り値**: `boolean`

### getFileSizeBytes

```typescript
getFileSizeBytes(filePath: string): number
```

Get checkpoint file size in bytes.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| filePath | `string` | はい |

**戻り値**: `number`

### initCheckpointManager

```typescript
initCheckpointManager(configOverrides?: Partial<CheckpointManagerConfig>): void
```

Initialize the checkpoint manager.
Must be called before using other checkpoint operations.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| configOverrides | `Partial<CheckpointManagerConfig>` | いいえ |

**戻り値**: `void`

### getCheckpointManager

```typescript
getCheckpointManager(): {
  save: (checkpoint: Omit<Checkpoint, "id" | "createdAt"> & { id?: string }) => Promise<CheckpointSaveResult>;
  load: (taskId: string) => Promise<Checkpoint | null>;
  delete: (taskId: string) => Promise<boolean>;
  listExpired: () => Promise<Checkpoint[]>;
  cleanup: () => Promise<number>;
  getStats: () => CheckpointStats;
}
```

Get checkpoint manager instance (initializes if needed).

**戻り値**: `{
  save: (checkpoint: Omit<Checkpoint, "id" | "createdAt"> & { id?: string }) => Promise<CheckpointSaveResult>;
  load: (taskId: string) => Promise<Checkpoint | null>;
  delete: (taskId: string) => Promise<boolean>;
  listExpired: () => Promise<Checkpoint[]>;
  cleanup: () => Promise<number>;
  getStats: () => CheckpointStats;
}`

### saveCheckpoint

```typescript
async saveCheckpoint(checkpoint: Omit<Checkpoint, "id" | "createdAt"> & { id?: string }): Promise<CheckpointSaveResult>
```

Save a checkpoint to disk.
Operation is idempotent - saving the same taskId overwrites the previous checkpoint.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| checkpoint | `Omit<Checkpoint, "id" | "createdAt"> & { id?: string }` | はい |

**戻り値**: `Promise<CheckpointSaveResult>`

### loadCheckpoint

```typescript
async loadCheckpoint(taskId: string): Promise<Checkpoint | null>
```

Load a checkpoint by task ID.
Returns the most recent checkpoint for the given task.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| taskId | `string` | はい |

**戻り値**: `Promise<Checkpoint | null>`

### deleteCheckpoint

```typescript
async deleteCheckpoint(taskId: string): Promise<boolean>
```

Delete a checkpoint by task ID.
Removes all checkpoints associated with the task.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| taskId | `string` | はい |

**戻り値**: `Promise<boolean>`

### listExpiredCheckpoints

```typescript
async listExpiredCheckpoints(): Promise<Checkpoint[]>
```

List all expired checkpoints.

**戻り値**: `Promise<Checkpoint[]>`

### cleanupExpiredCheckpoints

```typescript
async cleanupExpiredCheckpoints(): Promise<number>
```

Clean up expired checkpoints.
Returns the number of checkpoints deleted.

**戻り値**: `Promise<number>`

### enforceMaxCheckpoints

```typescript
async enforceMaxCheckpoints(): Promise<void>
```

Enforce maximum checkpoint limit.
Removes oldest checkpoints if limit is exceeded.

**戻り値**: `Promise<void>`

### getCheckpointStats

```typescript
getCheckpointStats(): CheckpointStats
```

Get checkpoint statistics.

**戻り値**: `CheckpointStats`

### resetCheckpointManager

```typescript
resetCheckpointManager(): void
```

Reset checkpoint manager state (for testing).

**戻り値**: `void`

### isCheckpointManagerInitialized

```typescript
isCheckpointManagerInitialized(): boolean
```

Check if checkpoint manager is initialized.

**戻り値**: `boolean`

### getCheckpointDir

```typescript
getCheckpointDir(): string
```

Get checkpoint directory path.

**戻り値**: `string`

### getCheckpointConfigFromEnv

```typescript
getCheckpointConfigFromEnv(): Partial<CheckpointManagerConfig>
```

Get checkpoint manager config from environment variables.

**戻り値**: `Partial<CheckpointManagerConfig>`

## インターフェース

### Checkpoint

```typescript
interface Checkpoint {
  id: string;
  taskId: string;
  source: CheckpointSource;
  provider: string;
  model: string;
  priority: CheckpointPriority;
  state: unknown;
  progress: number;
  createdAt: number;
  ttlMs: number;
  metadata?: Record<string, unknown>;
}
```

Checkpoint state for a long-running task.

### CheckpointSaveResult

```typescript
interface CheckpointSaveResult {
  success: boolean;
  checkpointId: string;
  path: string;
  error?: string;
}
```

Result of checkpoint save operation.

### PreemptionResult

```typescript
interface PreemptionResult {
  success: boolean;
  checkpointId?: string;
  error?: string;
  resumedFromCheckpoint?: boolean;
}
```

Result of preemption operation.

### CheckpointManagerConfig

```typescript
interface CheckpointManagerConfig {
  checkpointDir: string;
  defaultTtlMs: number;
  maxCheckpoints: number;
  cleanupIntervalMs: number;
}
```

Checkpoint manager configuration.

### CheckpointStats

```typescript
interface CheckpointStats {
  totalCount: number;
  totalSizeBytes: number;
  oldestCreatedAt: number | null;
  newestCreatedAt: number | null;
  bySource: Record<CheckpointSource, number>;
  byPriority: Record<CheckpointPriority, number>;
  expiredCount: number;
}
```

Checkpoint statistics.

## 型定義

### CheckpointSource

```typescript
type CheckpointSource = | "subagent_run"
  | "subagent_run_parallel"
  | "agent_team_run"
  | "agent_team_run_parallel"
```

Source type for checkpointed tasks.
Must match TaskSource from task-scheduler.ts.

### CheckpointPriority

```typescript
type CheckpointPriority = "critical" | "high" | "normal" | "low" | "background"
```

Task priority for checkpoint ordering.

---
*自動生成: 2026-02-17T21:54:59.752Z*
