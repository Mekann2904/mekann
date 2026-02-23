---
title: cross-instance-runtime
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# cross-instance-runtime

## 概要

`cross-instance-runtime` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '@mariozechner/pi-tui': Text
// from '../lib/adaptive-rate-controller': initAdaptiveController, shutdownAdaptiveController, getEffectiveLimit, ...
// from '../lib/cross-instance-coordinator': registerInstance, unregisterInstance, getCoordinatorStatus, ...
// ... and 3 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerCrossInstanceRuntimeExtension` | 拡張機能を登録 |

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### pi_instance_status

Get current cross-instance coordinator status and parallelism allocation.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"
  participant Runtime as "Runtime"

  User->>System: Get current cross-instance coordinator status and paralle...
  System->>Storage: ensureAdaptiveControllerInitialized
  Storage->>Internal: アダプティブコントローラーを初期化する。
  Internal->>Internal: loadState
  Internal->>Internal: setInterval
  Internal->>Internal: processRecovery
  Internal->>Unresolved: recoveryTimer.unref (node_modules/@types/node/timers.d.ts)
  System->>Internal: コーディネーター詳細を取得
  Internal->>Runtime: 設定取得
  Runtime->>Internal: detectProfile
  Runtime->>Internal: parseNumber
  Runtime->>Internal: parseBoolean
  Internal->>Internal: getActiveInstanceCount
  Internal->>Internal: getContendingInstanceCount
  Internal->>Internal: getMyParallelLimit
  Internal->>Internal: getActiveInstances
  System->>Runtime: スナップショットを取得
  Runtime->>Internal: getSharedRuntimeState
  Runtime->>Internal: cleanupExpiredReservations
  Runtime->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Internal: getLocalRuntimeUsage
  Runtime->>Internal: getClusterUsageSafe
  Runtime->>Unresolved: runtime.queue.pending.slice(0, 16).map (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Unresolved: runtime.queue.pending.slice (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Unresolved: Math.trunc (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Internal: 使用状況取得
  Internal->>Unresolved: modelMap.get (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: modelMap.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: Array.from (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: modelMap.values (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  System->>Internal: 適応サマリーを整形
  Internal->>Internal: ensureState
  Internal->>Unresolved: currentState.globalMultiplier.toFixed (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.round (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.keys (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.entries(currentState.limits)       .filter(([key]) => isValidLearnedLimitKey(key))       .sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.entries(currentState.limits)       .filter (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.entries (node_modules/typescript/lib/lib.es2017.object.d.ts)
  Internal->>Internal: isValidLearnedLimitKey
  Internal->>Unresolved: a[0].localeCompare (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: new Date(limit.last429At).getTime (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### pi_model_limits

Get rate limits for a specific provider/model combination.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"
  participant Runtime as "Runtime"

  User->>System: Get rate limits for a specific provider/model combination.
  System->>Storage: ensureAdaptiveControllerInitialized
  Storage->>Internal: アダプティブコントローラーを初期化する。
  Internal->>Internal: loadState
  Internal->>Internal: setInterval
  Internal->>Internal: processRecovery
  Internal->>Unresolved: recoveryTimer.unref (node_modules/@types/node/timers.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: ティア特定
  Internal->>Unresolved: provider.toUpperCase (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Runtime: 指定したプロバイダ/モデル/ティアの制限を解決する
  Runtime->>Internal: getLimitsConfig
  Runtime->>Unresolved: provider.toLowerCase (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Unresolved: Object.prototype.hasOwnProperty.call (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Unresolved: Object.entries (node_modules/typescript/lib/lib.es2017.object.d.ts)
  Runtime->>Internal: matchesPattern
  System->>Runtime: 制限取得
  Runtime->>Internal: tryBuildKey
  Runtime->>Internal: ensureState
  System->>Internal: コーディネーター詳細を取得
  Internal->>Runtime: 設定取得
  Runtime->>Internal: detectProfile
  Runtime->>Internal: parseNumber
  Runtime->>Internal: parseBoolean
  Internal->>Internal: getActiveInstanceCount
  Internal->>Internal: getContendingInstanceCount
  Internal->>Internal: getMyParallelLimit
  Internal->>Internal: getActiveInstances
  System->>Runtime: 制限値取得
  Runtime->>Internal: clampConcurrency
  Runtime->>Unresolved: Math.floor (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Internal: withStateWriteLock
  System->>Runtime: 並列上限取得
  Runtime->>Internal: getActiveInstancesForModel
  Runtime->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[cross-instance-runtime]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    adaptive_rate_controller["adaptive-rate-controller"]
    cross_instance_coordinator["cross-instance-coordinator"]
    provider_limits["provider-limits"]
    agent_runtime["agent-runtime"]
    adaptive_total_limit["adaptive-total-limit"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  ensureAdaptiveControllerInitialized["ensureAdaptiveControllerInitialized()"]
  registerCrossInstanceRuntimeExtension["registerCrossInstanceRuntimeExtension()"]
  registerCrossInstanceRuntimeExtension --> ensureAdaptiveControllerInitialized
```

## 関数

### ensureAdaptiveControllerInitialized

```typescript
ensureAdaptiveControllerInitialized(): void
```

Ensure adaptive controller is initialized (lazy on first session start).
This defers file I/O from extension load time to first actual use.

**戻り値**: `void`

### registerCrossInstanceRuntimeExtension

```typescript
registerCrossInstanceRuntimeExtension(pi: ExtensionAPI): void
```

拡張機能を登録

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

---
*自動生成: 2026-02-23T06:29:41.929Z*
