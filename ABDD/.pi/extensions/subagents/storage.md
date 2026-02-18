---
title: storage
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# storage

## 概要

`storage` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': existsSync, readFileSync
// from 'node:path': join
// from '../../lib/storage-base.js': createPathsFactory, createEnsurePaths, pruneRunArtifacts, ...
// from '../../lib/storage-lock.js': atomicWriteTextFile, withFileLock
// from '../../lib/comprehensive-logger.js': getLogger
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `createDefaultAgents` | デフォルト作成 |
| 関数 | `loadStorage` | ストレージを読み込み |
| 関数 | `saveStorage` | ストレージを保存 |
| 関数 | `saveStorageWithPatterns` | ストレージを保存 |
| インターフェース | `SubagentDefinition` | サブエージェントの定義情報を表すインターフェース |
| インターフェース | `SubagentRunRecord` | サブエージェントの実行記録 |
| インターフェース | `SubagentStorage` | サブエージェントのストレージ |
| インターフェース | `SubagentPaths` | パス定義 |
| 型 | `AgentEnabledState` | エージェントの有効/無効状態 |

## 図解

### クラス図

```mermaid
classDiagram
  class SubagentDefinition {
    <<interface>>
    +id: string
    +name: string
    +description: string
    +systemPrompt: string
    +provider: string
  }
  class SubagentRunRecord {
    <<interface>>
    +runId: string
    +agentId: string
    +task: string
    +summary: string
    +status: completed_failed
  }
  class SubagentStorage {
    <<interface>>
    +agents: SubagentDefinition
    +runs: SubagentRunRecord
    +currentAgentId: string
    +defaultsVersion: number
  }
  class SubagentPaths {
    <<interface>>
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[storage]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    storage_base["storage-base"]
    storage_lock["storage-lock"]
    comprehensive_logger["comprehensive-logger"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  createDefaultAgents["createDefaultAgents()"]
  ensureDefaults["ensureDefaults()"]
  loadStorage["loadStorage()"]
  mergeDefaultSubagent["mergeDefaultSubagent()"]
  mergeSubagentStorageWithDisk["mergeSubagentStorageWithDisk()"]
  saveStorage["saveStorage()"]
  saveStorageWithPatterns["saveStorageWithPatterns()"]
  ensureDefaults --> createDefaultAgents
  ensureDefaults --> mergeDefaultSubagent
  loadStorage --> createDefaultAgents
  loadStorage --> ensureDefaults
  loadStorage --> saveStorage
  mergeSubagentStorageWithDisk --> mergeSubagentStorageWithDisk
  saveStorage --> mergeSubagentStorageWithDisk
  saveStorageWithPatterns --> saveStorage
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant storage as "storage"
  participant storage_base as "storage-base"
  participant storage_lock as "storage-lock"

  Caller->>storage: createDefaultAgents()
  storage->>storage_base: 内部関数呼び出し
  storage_base-->>storage: 結果
  storage-->>Caller: SubagentDefinition

  Caller->>storage: loadStorage()
  storage-->>Caller: SubagentStorage
```

## 関数

### createDefaultAgents

```typescript
createDefaultAgents(nowIso: string): SubagentDefinition[]
```

デフォルト作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| nowIso | `string` | はい |

**戻り値**: `SubagentDefinition[]`

### mergeDefaultSubagent

```typescript
mergeDefaultSubagent(existing: SubagentDefinition, fallback: SubagentDefinition): SubagentDefinition
```

Merge existing subagent with default values.
Note: Kept locally because this is subagent-specific merge logic.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| existing | `SubagentDefinition` | はい |
| fallback | `SubagentDefinition` | はい |

**戻り値**: `SubagentDefinition`

### ensureDefaults

```typescript
ensureDefaults(storage: SubagentStorage, nowIso: string): SubagentStorage
```

Ensure storage has default agents.
Note: Kept locally because default agent logic is subagent-specific.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `SubagentStorage` | はい |
| nowIso | `string` | はい |

**戻り値**: `SubagentStorage`

### mergeSubagentStorageWithDisk

```typescript
mergeSubagentStorageWithDisk(storageFile: string, next: SubagentStorage): SubagentStorage
```

Merge storage with disk state (for concurrent access).
Uses common utility from lib/storage-base.ts.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storageFile | `string` | はい |
| next | `SubagentStorage` | はい |

**戻り値**: `SubagentStorage`

### loadStorage

```typescript
loadStorage(cwd: string): SubagentStorage
```

ストレージを読み込み

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `SubagentStorage`

### saveStorage

```typescript
saveStorage(cwd: string, storage: SubagentStorage): void
```

ストレージを保存

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| storage | `SubagentStorage` | はい |

**戻り値**: `void`

### saveStorageWithPatterns

```typescript
async saveStorageWithPatterns(cwd: string, storage: SubagentStorage): Promise<void>
```

ストレージを保存

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| storage | `SubagentStorage` | はい |

**戻り値**: `Promise<void>`

## インターフェース

### SubagentDefinition

```typescript
interface SubagentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  provider?: string;
  model?: string;
  enabled: AgentEnabledState;
  skills?: string[];
  createdAt: string;
  updatedAt: string;
}
```

サブエージェントの定義情報を表すインターフェース

### SubagentRunRecord

```typescript
interface SubagentRunRecord {
  runId: string;
  agentId: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  outputFile: string;
  error?: string;
  correlationId?: string;
  parentEventId?: string;
}
```

サブエージェントの実行記録

### SubagentStorage

```typescript
interface SubagentStorage {
  agents: SubagentDefinition[];
  runs: SubagentRunRecord[];
  currentAgentId?: string;
  defaultsVersion?: number;
}
```

サブエージェントのストレージ

### SubagentPaths

```typescript
interface SubagentPaths {
}
```

パス定義

## 型定義

### AgentEnabledState

```typescript
type AgentEnabledState = "enabled" | "disabled"
```

エージェントの有効/無効状態

---
*自動生成: 2026-02-18T15:54:41.375Z*
