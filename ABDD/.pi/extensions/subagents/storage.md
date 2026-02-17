---
title: storage
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# storage

## 概要

`storage` モジュールのAPIリファレンス。

## インポート

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPathsFactory, createEnsurePaths, pruneRunArtifacts... } from '../../lib/storage-base.js';
import { atomicWriteTextFile, withFileLock } from '../../lib/storage-lock.js';
import { getLogger } from '../../lib/comprehensive-logger.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `createDefaultAgents` | Create default subagent definitions. |
| 関数 | `loadStorage` | Load subagent storage from disk. |
| 関数 | `saveStorage` | Save subagent storage to disk. |
| 関数 | `saveStorageWithPatterns` | Save storage and extract patterns from recent runs |
| インターフェース | `SubagentDefinition` | - |
| インターフェース | `SubagentRunRecord` | - |
| インターフェース | `SubagentStorage` | - |
| インターフェース | `SubagentPaths` | - |
| 型 | `AgentEnabledState` | - |

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
    +status: completedfailed
  }
  class SubagentStorage {
    <<interface>>
    +agents: SubagentDefinition[]
    +runs: SubagentRunRecord[]
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
    storage_base_js[storage-base.js]
    storage_lock_js[storage-lock.js]
    comprehensive_logger_js[comprehensive-logger.js]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  createDefaultAgents["createDefaultAgents()"]
  loadStorage["loadStorage()"]
  saveStorage["saveStorage()"]
  saveStorageWithPatterns["saveStorageWithPatterns()"]
  createDefaultAgents -.-> loadStorage
  loadStorage -.-> saveStorage
  saveStorage -.-> saveStorageWithPatterns
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant storage as storage
  participant storage_base_js as storage-base.js
  participant storage_lock_js as storage-lock.js

  Caller->>storage: createDefaultAgents()
  storage->>storage_base_js: 内部関数呼び出し
  storage_base_js-->>storage: 結果
  storage-->>Caller: SubagentDefinition[]

  Caller->>storage: loadStorage()
  storage-->>Caller: SubagentStorage
```

## 関数

### createDefaultAgents

```typescript
createDefaultAgents(nowIso: string): SubagentDefinition[]
```

Create default subagent definitions.

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

Load subagent storage from disk.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `SubagentStorage`

### saveStorage

```typescript
saveStorage(cwd: string, storage: SubagentStorage): void
```

Save subagent storage to disk.

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

Save storage and extract patterns from recent runs.
Integrates with ALMA memory system for automatic learning.

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

### SubagentStorage

```typescript
interface SubagentStorage {
  agents: SubagentDefinition[];
  runs: SubagentRunRecord[];
  currentAgentId?: string;
  defaultsVersion?: number;
}
```

### SubagentPaths

```typescript
interface SubagentPaths {
}
```

## 型定義

### AgentEnabledState

```typescript
type AgentEnabledState = "enabled" | "disabled"
```

---
*自動生成: 2026-02-17T21:54:59.725Z*
