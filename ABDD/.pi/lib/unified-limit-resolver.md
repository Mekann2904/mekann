---
title: unified-limit-resolver
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# unified-limit-resolver

## 概要

`unified-limit-resolver` モジュールのAPIリファレンス。

## インポート

```typescript
// from './adaptive-rate-controller.js': getEffectiveLimit, getLearnedLimit, getPredictiveAnalysis, ...
// from './cross-instance-coordinator.js': getMyParallelLimit, getModelParallelLimit, getCoordinatorStatus, ...
// from './provider-limits.js': resolveLimits, getConcurrencyLimit, getRpmLimit, ...
// from './runtime-config.js': getRuntimeConfig, validateConfigConsistency, RuntimeConfig
// from './interfaces/runtime-snapshot.js': IRuntimeSnapshot, RuntimeSnapshotProvider
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `setRuntimeSnapshotProvider` | ランタイムスナップショットプロバイダを設定 |
| 関数 | `isSnapshotProviderInitialized` | スナップショットプロバイダ初期化判定 |
| 関数 | `getInitializationState` | 初期化状態を取得 |
| 関数 | `getUnifiedEnvConfig` | 統合環境設定を取得 |
| 関数 | `resolveUnifiedLimits` | 統合制限を解決 |
| 関数 | `formatUnifiedLimitsResult` | 制限結果をフォーマット |
| 関数 | `getAllLimitsSummary` | 制限サマリを生成 |
| インターフェース | `UnifiedLimitInput` | 統合リミット入力インターフェース |
| インターフェース | `LimitBreakdown` | リミット内訳のインターフェース |
| インターフェース | `UnifiedLimitResult` | 統一リミット結果のインターフェース |
| 型 | `UnifiedEnvConfig` | 統合環境設定の型 |

## 図解

### クラス図

```mermaid
classDiagram
  class UnifiedLimitInput {
    <<interface>>
    +provider: string
    +model: string
    +tier: string
    +operationType: subagent_team_o
    +priority: critical_high_n
  }
  class LimitBreakdown {
    <<interface>>
    +preset: concurrency_number
    +adaptive: multiplier_number_l
    +crossInstance: activeInstances_num
    +runtime: maxActive_number_cu
    +prediction: PredictiveAnalysis
  }
  class UnifiedLimitResult {
    <<interface>>
    +effectiveConcurrency: number
    +effectiveRpm: number
    +effectiveTpm: number
    +breakdown: LimitBreakdown
    +limitingFactor: preset_adaptive
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[unified-limit-resolver]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    adaptive_rate_controller["adaptive-rate-controller"]
    cross_instance_coordinator["cross-instance-coordinator"]
    provider_limits["provider-limits"]
    runtime_config["runtime-config"]
    runtime_snapshot["runtime-snapshot"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  formatUnifiedLimitsResult["formatUnifiedLimitsResult()"]
  getAllLimitsSummary["getAllLimitsSummary()"]
  getInitializationState["getInitializationState()"]
  getRuntimeSnapshot["getRuntimeSnapshot()"]
  getUnifiedEnvConfig["getUnifiedEnvConfig()"]
  isSnapshotProviderInitialized["isSnapshotProviderInitialized()"]
  resolveUnifiedLimits["resolveUnifiedLimits()"]
  setRuntimeSnapshotProvider["setRuntimeSnapshotProvider()"]
  resolveUnifiedLimits --> getRuntimeSnapshot
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant unified_limit_resolver as "unified-limit-resolver"
  participant adaptive_rate_controller as "adaptive-rate-controller"
  participant cross_instance_coordinator as "cross-instance-coordinator"

  Caller->>unified_limit_resolver: setRuntimeSnapshotProvider()
  unified_limit_resolver->>adaptive_rate_controller: 内部関数呼び出し
  adaptive_rate_controller-->>unified_limit_resolver: 結果
  unified_limit_resolver-->>Caller: void

  Caller->>unified_limit_resolver: isSnapshotProviderInitialized()
  unified_limit_resolver-->>Caller: boolean
```

## 関数

### setRuntimeSnapshotProvider

```typescript
setRuntimeSnapshotProvider(fn: RuntimeSnapshotProvider): void
```

ランタイムスナップショットプロバイダを設定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| fn | `RuntimeSnapshotProvider` | はい |

**戻り値**: `void`

### isSnapshotProviderInitialized

```typescript
isSnapshotProviderInitialized(): boolean
```

スナップショットプロバイダ初期化判定

**戻り値**: `boolean`

### getInitializationState

```typescript
getInitializationState(): typeof _initializationState
```

初期化状態を取得

**戻り値**: `typeof _initializationState`

### getRuntimeSnapshot

```typescript
getRuntimeSnapshot(): IRuntimeSnapshot
```

Get runtime snapshot with fallback to default values.
Internal function used by resolveUnifiedLimits.

If the snapshot provider is not initialized, logs a warning once
and returns default values (all zeros).

**戻り値**: `IRuntimeSnapshot`

### getUnifiedEnvConfig

```typescript
getUnifiedEnvConfig(): UnifiedEnvConfig
```

統合環境設定を取得

**戻り値**: `UnifiedEnvConfig`

### resolveUnifiedLimits

```typescript
resolveUnifiedLimits(input: UnifiedLimitInput): UnifiedLimitResult
```

統合制限を解決

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `UnifiedLimitInput` | はい |

**戻り値**: `UnifiedLimitResult`

### formatUnifiedLimitsResult

```typescript
formatUnifiedLimitsResult(result: UnifiedLimitResult): string
```

制限結果をフォーマット

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `UnifiedLimitResult` | はい |

**戻り値**: `string`

### getAllLimitsSummary

```typescript
getAllLimitsSummary(): string
```

制限サマリを生成

**戻り値**: `string`

## インターフェース

### UnifiedLimitInput

```typescript
interface UnifiedLimitInput {
  provider: string;
  model: string;
  tier?: string;
  operationType?: "subagent" | "team" | "orchestration" | "direct";
  priority?: "critical" | "high" | "normal" | "low" | "background";
}
```

統合リミット入力インターフェース

### LimitBreakdown

```typescript
interface LimitBreakdown {
  preset: {
    concurrency: number;
    rpm: number;
    tpm?: number;
    source: string;
    tier: string;
  };
  adaptive: {
    multiplier: number;
    learnedConcurrency: number;
    historical429s: number;
    predicted429Probability: number;
  };
  crossInstance: {
    activeInstances: number;
    myShare: number;
  };
  runtime: {
    maxActive: number;
    currentActive: number;
    available: number;
  };
  prediction?: PredictiveAnalysis;
}
```

リミット内訳のインターフェース

### UnifiedLimitResult

```typescript
interface UnifiedLimitResult {
  effectiveConcurrency: number;
  effectiveRpm: number;
  effectiveTpm?: number;
  breakdown: LimitBreakdown;
  limitingFactor: "preset" | "adaptive" | "cross_instance" | "runtime" | "env_override";
  limitingReason: string;
  metadata: {
    provider: string;
    model: string;
    tier: string;
    resolvedAt: string;
  };
}
```

統一リミット結果のインターフェース

## 型定義

### UnifiedEnvConfig

```typescript
type UnifiedEnvConfig = RuntimeConfig
```

統合環境設定の型

---
*自動生成: 2026-02-23T06:29:42.440Z*
