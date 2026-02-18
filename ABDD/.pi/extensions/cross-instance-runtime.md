---
title: cross-instance-runtime
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# cross-instance-runtime

## 概要

`cross-instance-runtime` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '../lib/adaptive-rate-controller': initAdaptiveController, shutdownAdaptiveController, getEffectiveLimit, ...
// from '../lib/cross-instance-coordinator': registerInstance, unregisterInstance, getCoordinatorStatus, ...
// from '../lib/provider-limits': resolveLimits, getConcurrencyLimit, formatLimitsSummary, ...
// from './agent-runtime': getRuntimeSnapshot, notifyRuntimeCapacityChanged
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerCrossInstanceRuntimeExtension` | クロスインスタンスランタイム拡張を登録する |

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### pi_instance_status

Get current cross-instance coordinator status and parallelism allocation.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Internal as "Internal"
  participant Runtime as "Runtime"
  participant Unresolved as "Unresolved"

  User->>System: Get current cross-instance coordinator status and paralle...
  System->>Internal: コーディネーターの詳細ステータスを取得する
  Internal->>Internal: getActiveInstanceCount
  Internal->>Internal: getMyParallelLimit
  Internal->>Internal: getActiveInstances
  System->>Runtime: ランタイムのスナップショットを取得する
  Runtime->>Internal: getSharedRuntimeState
  Runtime->>Internal: cleanupExpiredReservations
  Runtime->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Unresolved: runtime.queue.pending.slice(0, 16).map (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Unresolved: runtime.queue.pending.slice (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: モデル使用状況の概要を取得
  Internal->>Unresolved: modelMap.get (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: modelMap.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: Array.from (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: modelMap.values (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  System->>Internal: 適応制御状態の概要を作成する。
  Internal->>Internal: ensureState
  Internal->>Unresolved: currentState.globalMultiplier.toFixed (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.round (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.keys (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.entries (node_modules/typescript/lib/lib.es2017.object.d.ts)
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
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Runtime as "Runtime"

  User->>System: Get rate limits for a specific provider/model combination.
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: 環境変数からティアを検出します。
  Internal->>Unresolved: provider.toUpperCase (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Runtime: 指定したプロバイダ/モデル/ティアの制限を解決する
  Runtime->>Internal: getLimitsConfig
  Runtime->>Unresolved: provider.toLowerCase (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Unresolved: Object.entries (node_modules/typescript/lib/lib.es2017.object.d.ts)
  Runtime->>Internal: matchesPattern
  System->>Runtime: 指定プロバイダー/モデルの学習済み制限を取得
  Runtime->>Internal: ensureState
  Runtime->>Internal: buildKey
  System->>Internal: コーディネーターの詳細ステータスを取得する
  Internal->>Internal: getActiveInstanceCount
  Internal->>Internal: getMyParallelLimit
  Internal->>Internal: getActiveInstances
  System->>Runtime: プロバイダーとモデルの有効な同時実行制限を取得
  Runtime->>Unresolved: Math.floor (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Internal: clampConcurrency
  Runtime->>Internal: saveState
  System->>Runtime: モデルごとの実行並列数の上限を取得
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
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

## 関数

### registerCrossInstanceRuntimeExtension

```typescript
registerCrossInstanceRuntimeExtension(pi: ExtensionAPI): void
```

クロスインスタンスランタイム拡張を登録する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

---
*自動生成: 2026-02-18T14:31:30.690Z*
