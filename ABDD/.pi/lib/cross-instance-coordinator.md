---
title: cross-instance-coordinator
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# cross-instance-coordinator

## 概要

`cross-instance-coordinator` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': existsSync, mkdirSync, readdirSync, ...
// from 'node:os': homedir
// from 'node:path': join
// from 'node:process': pid
// from './runtime-config.js': getRuntimeConfig, RuntimeConfig
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerInstance` | インスタンスを登録してハートビートを開始する |
| 関数 | `unregisterInstance` | 自身のインスタンス登録を解除 |
| 関数 | `updateHeartbeat` | ハートビート時刻を更新 |
| 関数 | `cleanupDeadInstances` | 無効なインスタンス情報を削除 |
| 関数 | `getActiveInstanceCount` | アクティブなインスタンス数を取得 |
| 関数 | `getActiveInstances` | アクティブなインスタンス情報一覧を取得 |
| 関数 | `getMyParallelLimit` | 自身の並列実行数の上限を取得する |
| 関数 | `getDynamicParallelLimit` | 動的並列数の上限を計算する |
| 関数 | `shouldAttemptWorkStealing` | ワークスチーリングを試行すべきか判定する |
| 関数 | `getWorkStealingCandidates` | ワークスチーリングの候補を取得する |
| 関数 | `updateWorkloadInfo` | ワークロード情報を更新する |
| 関数 | `getCoordinatorStatus` | コーディネーター詳細を取得 |
| 関数 | `isCoordinatorInitialized` | コーディネータ初期化確認 |
| 関数 | `getTotalMaxLlm` | - |
| 関数 | `getEnvOverrides` | 環境変数による設定上書きを取得 |
| 関数 | `setActiveModel` | アクティブモデルを設定 |
| 関数 | `clearActiveModel` | 指定モデル情報をクリア |
| 関数 | `clearAllActiveModels` | 全てのモデル情報をクリア |
| 関数 | `getActiveInstancesForModel` | アクティブインスタンス数を取得 |
| 関数 | `getModelParallelLimit` | 並列数上限を取得 |
| 関数 | `getModelUsageSummary` | 使用状況を取得 |
| 関数 | `broadcastQueueState` | キューステータスを他のインスタンスにブロードキャスト |
| 関数 | `getRemoteQueueStates` | リモートキューステータスを取得 |
| 関数 | `checkRemoteCapacity` | リモート容量を確認 |
| 関数 | `stealWork` | タスクをスチール実行 |
| 関数 | `getWorkStealingSummary` | ワークスチーリング概要取得 |
| 関数 | `cleanupQueueStates` | キュー状態を初期化 |
| 関数 | `isIdle` | アイドル状態か確認 |
| 関数 | `findStealCandidate` | 奪取候補を検索 |
| 関数 | `safeStealWork` | 安全にタスクを奪取 |
| 関数 | `getStealingStats` | ステータス統計を取得 |
| 関数 | `resetStealingStats` | ステータス統計をリセット |
| 関数 | `cleanupExpiredLocks` | 期限切れロックを削除 |
| 関数 | `enhancedHeartbeat` | ハートビート処理の強化 |
| インターフェース | `ActiveModelInfo` | アクティブなモデルの情報を表すインターフェース |
| インターフェース | `InstanceInfo` | インスタンスの情報を表す |
| インターフェース | `CoordinatorConfig` | コーディネータの設定を表すインターフェース |
| インターフェース | `CoordinatorInternalState` | コーディネータの内部状態を表すインターフェース |
| インターフェース | `StealableQueueEntry` | 横取り可能なキューエントリ |
| インターフェース | `BroadcastQueueState` | ブロードキャスト用キューステート |
| インターフェース | `StealingStats` | ステータス統計情報 |

## 図解

### クラス図

```mermaid
classDiagram
  class ActiveModelInfo {
    <<interface>>
    +provider: string
    +model: string
    +since: string
  }
  class InstanceInfo {
    <<interface>>
    +instanceId: string
    +pid: number
    +sessionId: string
    +startedAt: string
    +lastHeartbeat: string
  }
  class CoordinatorConfig {
    <<interface>>
    +totalMaxLlm: number
    +heartbeatIntervalMs: number
    +heartbeatTimeoutMs: number
  }
  class CoordinatorInternalState {
    <<interface>>
    +myInstanceId: string
    +mySessionId: string
    +myStartedAt: string
    +config: CoordinatorConfig
    +heartbeatTimer: ReturnType_typeofset
  }
  class StealableQueueEntry {
    <<interface>>
    +id: string
    +toolName: string
    +priority: string
    +instanceId: string
    +enqueuedAt: string
  }
  class BroadcastQueueState {
    <<interface>>
    +instanceId: string
    +timestamp: string
    +pendingTaskCount: number
    +avgLatencyMs: number
    +activeOrchestrations: number
  }
  class DistributedLock {
    <<interface>>
    +lockId: string
    +acquiredAt: number
    +expiresAt: number
    +resource: string
  }
  class StealingStats {
    <<interface>>
    +totalAttempts: number
    +successfulSteals: number
    +failedAttempts: number
    +successRate: number
    +avgLatencyMs: number
  }
  class StealingStatsInternal {
    <<interface>>
    +totalAttempts: number
    +successfulSteals: number
    +failedAttempts: number
    +lastAttemptAt: number_null
    +lastSuccessAt: number_null
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[cross-instance-coordinator]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    runtime_config["runtime-config"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  cleanupDeadInstances["cleanupDeadInstances()"]
  clearActiveModel["clearActiveModel()"]
  clearAllActiveModels["clearAllActiveModels()"]
  ensureDirs["ensureDirs()"]
  generateInstanceId["generateInstanceId()"]
  getActiveInstanceCount["getActiveInstanceCount()"]
  getActiveInstances["getActiveInstances()"]
  getActiveInstancesForModel["getActiveInstancesForModel()"]
  getCoordinatorStatus["getCoordinatorStatus()"]
  getDynamicParallelLimit["getDynamicParallelLimit()"]
  getEnvOverrides["getEnvOverrides()"]
  getMyParallelLimit["getMyParallelLimit()"]
  getTotalMaxLlm["getTotalMaxLlm()"]
  getWorkStealingCandidates["getWorkStealingCandidates()"]
  isCoordinatorInitialized["isCoordinatorInitialized()"]
  isInstanceAlive["isInstanceAlive()"]
  loadConfig["loadConfig()"]
  parseLockFile["parseLockFile()"]
  registerInstance["registerInstance()"]
  setActiveModel["setActiveModel()"]
  shouldAttemptWorkStealing["shouldAttemptWorkStealing()"]
  unregisterInstance["unregisterInstance()"]
  updateHeartbeat["updateHeartbeat()"]
  updateWorkloadInfo["updateWorkloadInfo()"]
  cleanupDeadInstances --> ensureDirs
  cleanupDeadInstances --> isInstanceAlive
  cleanupDeadInstances --> parseLockFile
  getActiveInstanceCount --> ensureDirs
  getActiveInstanceCount --> isInstanceAlive
  getActiveInstanceCount --> parseLockFile
  getActiveInstances --> ensureDirs
  getActiveInstances --> isInstanceAlive
  getActiveInstances --> parseLockFile
  getActiveInstancesForModel --> getActiveInstances
  getCoordinatorStatus --> getActiveInstanceCount
  getCoordinatorStatus --> getActiveInstances
  getCoordinatorStatus --> getMyParallelLimit
  getDynamicParallelLimit --> getActiveInstances
  getMyParallelLimit --> getActiveInstanceCount
  getWorkStealingCandidates --> getActiveInstances
  registerInstance --> cleanupDeadInstances
  registerInstance --> ensureDirs
  registerInstance --> generateInstanceId
  registerInstance --> loadConfig
  registerInstance --> updateHeartbeat
  shouldAttemptWorkStealing --> getActiveInstances
  updateHeartbeat --> ensureDirs
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant cross_instance_coordinator as "cross-instance-coordinator"
  participant runtime_config as "runtime-config"

  Caller->>cross_instance_coordinator: registerInstance()
  cross_instance_coordinator->>runtime_config: 内部関数呼び出し
  runtime_config-->>cross_instance_coordinator: 結果
  cross_instance_coordinator-->>Caller: void

  Caller->>cross_instance_coordinator: unregisterInstance()
  cross_instance_coordinator-->>Caller: void
```

## 関数

### getDefaultConfig

```typescript
getDefaultConfig(): CoordinatorConfig
```

Get default config from centralized RuntimeConfig.
This ensures consistency with other layers.

**戻り値**: `CoordinatorConfig`

### ensureDirs

```typescript
ensureDirs(): void
```

**戻り値**: `void`

### generateInstanceId

```typescript
generateInstanceId(sessionId: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| sessionId | `string` | はい |

**戻り値**: `string`

### parseLockFile

```typescript
parseLockFile(filename: string): InstanceInfo | null
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| filename | `string` | はい |

**戻り値**: `InstanceInfo | null`

### isInstanceAlive

```typescript
isInstanceAlive(info: InstanceInfo, nowMs: number, timeoutMs: number): boolean
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| info | `InstanceInfo` | はい |
| nowMs | `number` | はい |
| timeoutMs | `number` | はい |

**戻り値**: `boolean`

### loadConfig

```typescript
loadConfig(): CoordinatorConfig
```

**戻り値**: `CoordinatorConfig`

### registerInstance

```typescript
registerInstance(sessionId: string, cwd: string, configOverrides?: Partial<CoordinatorConfig>): void
```

インスタンスを登録してハートビートを開始する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| sessionId | `string` | はい |
| cwd | `string` | はい |
| configOverrides | `Partial<CoordinatorConfig>` | いいえ |

**戻り値**: `void`

### unregisterInstance

```typescript
unregisterInstance(): void
```

自身のインスタンス登録を解除

**戻り値**: `void`

### updateHeartbeat

```typescript
updateHeartbeat(): void
```

ハートビート時刻を更新

**戻り値**: `void`

### cleanupDeadInstances

```typescript
cleanupDeadInstances(): void
```

無効なインスタンス情報を削除

**戻り値**: `void`

### getActiveInstanceCount

```typescript
getActiveInstanceCount(): number
```

アクティブなインスタンス数を取得

**戻り値**: `number`

### getActiveInstances

```typescript
getActiveInstances(): InstanceInfo[]
```

アクティブなインスタンス情報一覧を取得

**戻り値**: `InstanceInfo[]`

### getMyParallelLimit

```typescript
getMyParallelLimit(): number
```

自身の並列実行数の上限を取得する

**戻り値**: `number`

### getDynamicParallelLimit

```typescript
getDynamicParallelLimit(myPendingTasks: number): number
```

動的並列数の上限を計算する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| myPendingTasks | `number` | はい |

**戻り値**: `number`

### shouldAttemptWorkStealing

```typescript
shouldAttemptWorkStealing(): boolean
```

ワークスチーリングを試行すべきか判定する

**戻り値**: `boolean`

### getWorkStealingCandidates

```typescript
getWorkStealingCandidates(topN: number): string[]
```

ワークスチーリングの候補を取得する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| topN | `number` | はい |

**戻り値**: `string[]`

### updateWorkloadInfo

```typescript
updateWorkloadInfo(pendingTaskCount: number, avgLatencyMs?: number): void
```

ワークロード情報を更新する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pendingTaskCount | `number` | はい |
| avgLatencyMs | `number` | いいえ |

**戻り値**: `void`

### getCoordinatorStatus

```typescript
getCoordinatorStatus(): {
  registered: boolean;
  myInstanceId: string | null;
  activeInstanceCount: number;
  myParallelLimit: number;
  config: CoordinatorConfig | null;
  instances: InstanceInfo[];
}
```

コーディネーター詳細を取得

**戻り値**: `{
  registered: boolean;
  myInstanceId: string | null;
  activeInstanceCount: number;
  myParallelLimit: number;
  config: CoordinatorConfig | null;
  instances: InstanceInfo[];
}`

### isCoordinatorInitialized

```typescript
isCoordinatorInitialized(): boolean
```

コーディネータ初期化確認

**戻り値**: `boolean`

### getTotalMaxLlm

```typescript
getTotalMaxLlm(): number
```

**戻り値**: `number`

### getEnvOverrides

```typescript
getEnvOverrides(): Partial<CoordinatorConfig>
```

環境変数による設定上書きを取得

**戻り値**: `Partial<CoordinatorConfig>`

### setActiveModel

```typescript
setActiveModel(provider: string, model: string): void
```

アクティブモデルを設定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `void`

### clearActiveModel

```typescript
clearActiveModel(provider: string, model: string): void
```

指定モデル情報をクリア

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `void`

### clearAllActiveModels

```typescript
clearAllActiveModels(): void
```

全てのモデル情報をクリア

**戻り値**: `void`

### getActiveInstancesForModel

```typescript
getActiveInstancesForModel(provider: string, model: string): number
```

アクティブインスタンス数を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `number`

### getModelParallelLimit

```typescript
getModelParallelLimit(provider: string, model: string, baseLimit: number): number
```

並列数上限を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| baseLimit | `number` | はい |

**戻り値**: `number`

### matchesModelPattern

```typescript
matchesModelPattern(pattern: string, model: string): boolean
```

Simple pattern matching for model names.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pattern | `string` | はい |
| model | `string` | はい |

**戻り値**: `boolean`

### getModelUsageSummary

```typescript
getModelUsageSummary(): {
  models: Array<{
    provider: string;
    model: string;
    instanceCount: number;
  }>;
  instances: InstanceInfo[];
}
```

使用状況を取得

**戻り値**: `{
  models: Array<{
    provider: string;
    model: string;
    instanceCount: number;
  }>;
  instances: InstanceInfo[];
}`

### ensureQueueStateDir

```typescript
ensureQueueStateDir(): void
```

Ensure queue state directory exists.

**戻り値**: `void`

### broadcastQueueState

```typescript
broadcastQueueState(options: {
  pendingTaskCount: number;
  activeOrchestrations: number;
  stealableEntries?: StealableQueueEntry[];
  avgLatencyMs?: number;
}): void
```

キューステータスを他のインスタンスにブロードキャスト

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `object` | はい |
| &nbsp;&nbsp;↳ pendingTaskCount | `number` | はい |
| &nbsp;&nbsp;↳ activeOrchestrations | `number` | はい |
| &nbsp;&nbsp;↳ stealableEntries | `StealableQueueEntry[]` | いいえ |
| &nbsp;&nbsp;↳ avgLatencyMs | `number` | いいえ |

**戻り値**: `void`

### getRemoteQueueStates

```typescript
getRemoteQueueStates(): BroadcastQueueState[]
```

リモートキューステータスを取得

**戻り値**: `BroadcastQueueState[]`

### checkRemoteCapacity

```typescript
checkRemoteCapacity(): boolean
```

リモート容量を確認

**戻り値**: `boolean`

### stealWork

```typescript
stealWork(): StealableQueueEntry | null
```

タスクをスチール実行

**戻り値**: `StealableQueueEntry | null`

### getWorkStealingSummary

```typescript
getWorkStealingSummary(): {
  remoteInstances: number;
  totalPendingTasks: number;
  stealableTasks: number;
  idleInstances: number;
  busyInstances: number;
}
```

ワークスチーリング概要取得

**戻り値**: `{
  remoteInstances: number;
  totalPendingTasks: number;
  stealableTasks: number;
  idleInstances: number;
  busyInstances: number;
}`

### cleanupQueueStates

```typescript
cleanupQueueStates(): void
```

キュー状態を初期化

**戻り値**: `void`

### ensureLockDir

```typescript
ensureLockDir(): void
```

Ensure lock directory exists.

**戻り値**: `void`

### tryAcquireLock

```typescript
tryAcquireLock(resource: string, ttlMs: number): DistributedLock | null
```

Try to acquire a distributed lock.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| resource | `string` | はい |
| ttlMs | `number` | はい |

**戻り値**: `DistributedLock | null`

### releaseLock

```typescript
releaseLock(lock: DistributedLock): void
```

Release a distributed lock.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| lock | `DistributedLock` | はい |

**戻り値**: `void`

### isIdle

```typescript
isIdle(): boolean
```

アイドル状態か確認

**戻り値**: `boolean`

### findStealCandidate

```typescript
findStealCandidate(): InstanceInfo | null
```

奪取候補を検索

**戻り値**: `InstanceInfo | null`

### safeStealWork

```typescript
async safeStealWork(): Promise<StealableQueueEntry | null>
```

安全にタスクを奪取

**戻り値**: `Promise<StealableQueueEntry | null>`

### getStealingStats

```typescript
getStealingStats(): StealingStats
```

ステータス統計を取得

**戻り値**: `StealingStats`

### resetStealingStats

```typescript
resetStealingStats(): void
```

ステータス統計をリセット

**戻り値**: `void`

### cleanupExpiredLocks

```typescript
cleanupExpiredLocks(): void
```

期限切れロックを削除

**戻り値**: `void`

### enhancedHeartbeat

```typescript
enhancedHeartbeat(): void
```

ハートビート処理の強化

**戻り値**: `void`

## インターフェース

### ActiveModelInfo

```typescript
interface ActiveModelInfo {
  provider: string;
  model: string;
  since: string;
}
```

アクティブなモデルの情報を表すインターフェース

### InstanceInfo

```typescript
interface InstanceInfo {
  instanceId: string;
  pid: number;
  sessionId: string;
  startedAt: string;
  lastHeartbeat: string;
  cwd: string;
  activeModels: ActiveModelInfo[];
  pendingTaskCount?: number;
  avgLatencyMs?: number;
  lastTaskCompletedAt?: string;
}
```

インスタンスの情報を表す

### CoordinatorConfig

```typescript
interface CoordinatorConfig {
  totalMaxLlm: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
}
```

コーディネータの設定を表すインターフェース

### CoordinatorInternalState

```typescript
interface CoordinatorInternalState {
  myInstanceId: string;
  mySessionId: string;
  myStartedAt: string;
  config: CoordinatorConfig;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}
```

コーディネータの内部状態を表すインターフェース

### StealableQueueEntry

```typescript
interface StealableQueueEntry {
  id: string;
  toolName: string;
  priority: string;
  instanceId: string;
  enqueuedAt: string;
  estimatedDurationMs?: number;
  estimatedRounds?: number;
}
```

横取り可能なキューエントリ

### BroadcastQueueState

```typescript
interface BroadcastQueueState {
  instanceId: string;
  timestamp: string;
  pendingTaskCount: number;
  avgLatencyMs?: number;
  activeOrchestrations: number;
  stealableEntries: StealableQueueEntry[];
}
```

ブロードキャスト用キューステート

### DistributedLock

```typescript
interface DistributedLock {
  lockId: string;
  acquiredAt: number;
  expiresAt: number;
  resource: string;
}
```

Distributed lock for safe work stealing.

### StealingStats

```typescript
interface StealingStats {
  totalAttempts: number;
  successfulSteals: number;
  failedAttempts: number;
  successRate: number;
  avgLatencyMs: number;
  lastStealAt: number | null;
}
```

ステータス統計情報

### StealingStatsInternal

```typescript
interface StealingStatsInternal {
  totalAttempts: number;
  successfulSteals: number;
  failedAttempts: number;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  avgLatencyMs: number;
  latencySamples: number[];
}
```

Stealing statistics tracking (internal).

---
*自動生成: 2026-02-18T18:06:17.507Z*
