---
title: dynamic-parallelism
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# dynamic-parallelism

## 概要

`dynamic-parallelism` モジュールのAPIリファレンス。

## インポート

```typescript
import { QueueStats } from './task-scheduler';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getParallelismAdjuster` | Get the singleton adjuster instance. |
| 関数 | `createParallelismAdjuster` | Create a new adjuster with custom config. |
| 関数 | `resetParallelismAdjuster` | Reset the singleton adjuster (for testing). |
| 関数 | `getParallelism` | Get parallelism for a provider/model (convenience  |
| 関数 | `adjustForError` | Adjust parallelism for an error (convenience funct |
| 関数 | `attemptRecovery` | Attempt recovery (convenience function). |
| 関数 | `formatDynamicParallelismSummary` | Format a summary of the adjuster state. |
| クラス | `DynamicParallelismAdjuster` | Manages dynamic parallelism adjustment for LLM pro |
| インターフェース | `ParallelismConfig` | Configuration for parallelism adjustment. |
| インターフェース | `ProviderHealth` | Health status for a provider/model combination. |
| インターフェース | `DynamicAdjusterConfig` | Configuration for the adjuster. |
| インターフェース | `ErrorEvent` | Error event for tracking. |

## 図解

### クラス図

```mermaid
classDiagram
  class DynamicParallelismAdjuster {
    -states: Map_string_ProviderM
    -config: DynamicAdjusterConfi
    -recoveryTimer: ReturnType_typeofset
    -eventTarget: EventTarget
    +getParallelism()
    +getConfig()
    +adjustForError()
    +attemptRecovery()
    +applyCrossInstanceLimits()
  }
  class ParallelismConfig {
    <<interface>>
    +baseParallelism: number
    +currentParallelism: number
    +minParallelism: number
    +maxParallelism: number
    +adjustmentReason: string
  }
  class ProviderHealth {
    <<interface>>
    +healthy: boolean
    +activeRequests: number
    +recent429Count: number
    +avgResponseMs: number
    +recommendedBackoffMs: number
  }
  class ProviderModelState {
    <<interface>>
    +config: ParallelismConfig
    +health: ProviderHealth
    +activeRequests: number
    +recentErrors: Array_type_429_t
    +responseTimes: number
  }
  class DynamicAdjusterConfig {
    <<interface>>
    +minParallelism: number
    +baseParallelism: number
    +maxParallelism: number
    +reductionOn429: number
    +reductionOnTimeout: number
  }
  class ErrorEvent {
    <<interface>>
    +provider: string
    +model: string
    +type: T429_timeout_err
    +timestamp: number
    +details: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[dynamic-parallelism]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    task_scheduler["task-scheduler"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  getParallelismAdjuster["getParallelismAdjuster()"]
  createParallelismAdjuster["createParallelismAdjuster()"]
  resetParallelismAdjuster["resetParallelismAdjuster()"]
  getParallelism["getParallelism()"]
  adjustForError["adjustForError()"]
  attemptRecovery["attemptRecovery()"]
  getParallelismAdjuster -.-> createParallelismAdjuster
  createParallelismAdjuster -.-> resetParallelismAdjuster
  resetParallelismAdjuster -.-> getParallelism
  getParallelism -.-> adjustForError
  adjustForError -.-> attemptRecovery
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant dynamic_parallelism as "dynamic-parallelism"
  participant task_scheduler as "task-scheduler"

  Caller->>dynamic_parallelism: getParallelismAdjuster()
  dynamic_parallelism->>task_scheduler: 内部関数呼び出し
  task_scheduler-->>dynamic_parallelism: 結果
  dynamic_parallelism-->>Caller: DynamicParallelismAd

  Caller->>dynamic_parallelism: createParallelismAdjuster()
  dynamic_parallelism-->>Caller: DynamicParallelismAd
```

## 関数

### handler

```typescript
handler(e: Event): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| e | `Event` | はい |

**戻り値**: `void`

### getParallelismAdjuster

```typescript
getParallelismAdjuster(): DynamicParallelismAdjuster
```

Get the singleton adjuster instance.

**戻り値**: `DynamicParallelismAdjuster`

### createParallelismAdjuster

```typescript
createParallelismAdjuster(config: Partial<DynamicAdjusterConfig>): DynamicParallelismAdjuster
```

Create a new adjuster with custom config.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| config | `Partial<DynamicAdjusterConfig>` | はい |

**戻り値**: `DynamicParallelismAdjuster`

### resetParallelismAdjuster

```typescript
resetParallelismAdjuster(): void
```

Reset the singleton adjuster (for testing).

**戻り値**: `void`

### getParallelism

```typescript
getParallelism(provider: string, model: string): number
```

Get parallelism for a provider/model (convenience function).

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `number`

### adjustForError

```typescript
adjustForError(provider: string, model: string, errorType: "429" | "timeout" | "error"): void
```

Adjust parallelism for an error (convenience function).

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| errorType | `"429" | "timeout" | "error"` | はい |

**戻り値**: `void`

### attemptRecovery

```typescript
attemptRecovery(provider: string, model: string): void
```

Attempt recovery (convenience function).

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `void`

### formatDynamicParallelismSummary

```typescript
formatDynamicParallelismSummary(): string
```

Format a summary of the adjuster state.

**戻り値**: `string`

## クラス

### DynamicParallelismAdjuster

Manages dynamic parallelism adjustment for LLM providers.

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| states | `Map<string, ProviderModelState>` | private |
| config | `DynamicAdjusterConfig` | private |
| recoveryTimer | `ReturnType<typeof setInterval> | null` | private |
| eventTarget | `EventTarget` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| getParallelism | `getParallelism(provider, model): number` |
| getConfig | `getConfig(provider, model): ParallelismConfig` |
| adjustForError | `adjustForError(provider, model, errorType): void` |
| attemptRecovery | `attemptRecovery(provider, model): void` |
| applyCrossInstanceLimits | `applyCrossInstanceLimits(provider, model, instanceCount): void` |
| getHealth | `getHealth(provider, model): ProviderHealth` |
| recordSuccess | `recordSuccess(provider, model, responseMs): void` |
| requestStarted | `requestStarted(provider, model): void` |
| requestCompleted | `requestCompleted(provider, model): void` |
| getAllStates | `getAllStates(): Map<string, { config: ParallelismConfig; health: ProviderHealth }>` |
| reset | `reset(provider, model): void` |
| resetAll | `resetAll(): void` |
| onParallelismChange | `onParallelismChange(callback): () => void` |
| shutdown | `shutdown(): void` |
| buildKey | `buildKey(provider, model): string` |
| getOrCreateState | `getOrCreateState(key): ProviderModelState` |
| pruneErrors | `pruneErrors(state): void` |
| updateHealth | `updateHealth(state): void` |
| startRecoveryTimer | `startRecoveryTimer(): void` |
| processAutomaticRecovery | `processAutomaticRecovery(): void` |
| dispatchEvent | `dispatchEvent(type, detail): void` |
| log | `log(level, message): void` |

## インターフェース

### ParallelismConfig

```typescript
interface ParallelismConfig {
  baseParallelism: number;
  currentParallelism: number;
  minParallelism: number;
  maxParallelism: number;
  adjustmentReason: string;
  lastAdjustedAt: number;
}
```

Configuration for parallelism adjustment.

### ProviderHealth

```typescript
interface ProviderHealth {
  healthy: boolean;
  activeRequests: number;
  recent429Count: number;
  avgResponseMs: number;
  recommendedBackoffMs: number;
}
```

Health status for a provider/model combination.

### ProviderModelState

```typescript
interface ProviderModelState {
  config: ParallelismConfig;
  health: ProviderHealth;
  activeRequests: number;
  recentErrors: Array<{ type: "429" | "timeout" | "error"; timestamp: number }>;
  responseTimes: number[];
  crossInstanceMultiplier: number;
}
```

Internal state for a provider/model combination.

### DynamicAdjusterConfig

```typescript
interface DynamicAdjusterConfig {
  minParallelism: number;
  baseParallelism: number;
  maxParallelism: number;
  reductionOn429: number;
  reductionOnTimeout: number;
  increaseOnRecovery: number;
  recoveryIntervalMs: number;
  errorWindowMs: number;
  maxErrorHistory: number;
  maxResponseSamples: number;
}
```

Configuration for the adjuster.

### ErrorEvent

```typescript
interface ErrorEvent {
  provider: string;
  model: string;
  type: "429" | "timeout" | "error";
  timestamp: number;
  details?: string;
}
```

Error event for tracking.

---
*自動生成: 2026-02-18T00:15:35.679Z*
