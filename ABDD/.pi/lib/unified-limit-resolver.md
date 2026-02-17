---
title: Unified Limit Resolver
category: reference
audience: developer
last_updated: 2026-02-18
tags: [limits, rate-limiting, capacity, coordination]
related: [provider-limits, adaptive-rate-controller, cross-instance-coordinator, agent-runtime]
---

# Unified Limit Resolver

5層の並列数制限計算を統合するファサードレイヤー。

## 概要

プリセット、適応学習、クロスインスタンス分散、ランタイム制約を単一のインターフェースで提供する。

## Architecture

- **Layer 1:** provider-limits.ts (プリセット制限)
- **Layer 2:** adaptive-rate-controller.ts (429学習による調整)
- **Layer 3:** cross-instance-coordinator.ts (インスタンス間分散)
- **Layer 4:** agent-runtime.ts (ランタイム制約)
- **Layer 5:** task-scheduler.ts (優先度ベーススケジューリング)

## Types

### UnifiedLimitInput

制限解決の入力パラメータ。

```typescript
interface UnifiedLimitInput {
  /** プロバイダー名 (例: "anthropic", "openai") */
  provider: string;
  /** モデル名 (例: "claude-sonnet-4-20250514") */
  model: string;
  /** ティア (例: "pro", "max") - 省略時は自動検出 */
  tier?: string;
  /** 操作タイプ - サブエージェント/チーム/オーケストレーション */
  operationType?: "subagent" | "team" | "orchestration" | "direct";
  /** タスク優先度 */
  priority?: "critical" | "high" | "normal" | "low" | "background";
}
```

### LimitBreakdown

各レイヤーの制限内訳。

```typescript
interface LimitBreakdown {
  /** Layer 1: プリセット制限 */
  preset: {
    concurrency: number;
    rpm: number;
    tpm?: number;
    source: string;
    tier: string;
  };
  /** Layer 2: 適応的調整 */
  adaptive: {
    multiplier: number;
    learnedConcurrency: number;
    historical429s: number;
    predicted429Probability: number;
  };
  /** Layer 3: クロスインスタンス分散 */
  crossInstance: {
    activeInstances: number;
    myShare: number;
  };
  /** Layer 4: ランタイム制約 */
  runtime: {
    maxActive: number;
    currentActive: number;
    available: number;
  };
  /** 予測分析（オプション） */
  prediction?: PredictiveAnalysis;
}
```

### UnifiedLimitResult

制限解決の結果。

```typescript
interface UnifiedLimitResult {
  /** 最終的な有効並列数 */
  effectiveConcurrency: number;
  /** 最終的な有効RPM */
  effectiveRpm: number;
  /** 最終的な有効TPM（利用可能な場合） */
  effectiveTpm?: number;
  
  /** 各レイヤーの内訳（デバッグ用） */
  breakdown: LimitBreakdown;
  
  /** 最も制約となったレイヤー */
  limitingFactor: "preset" | "adaptive" | "cross_instance" | "runtime" | "env_override";
  
  /** 制約の理由 */
  limitingReason: string;
  
  /** メタデータ */
  metadata: {
    provider: string;
    model: string;
    tier: string;
    resolvedAt: string;
  };
}
```

### UnifiedEnvConfig

統合環境変数設定。

```typescript
interface UnifiedEnvConfig {
  /** 全体のLLM並列上限 */
  maxTotalLlm: number;
  /** 全体のリクエスト並列上限 */
  maxTotalRequests: number;
  /** サブエージェント並列数 */
  maxSubagentParallel: number;
  /** チーム並列数 */
  maxTeamParallel: number;
  /** チームメンバー並列数 */
  maxTeammateParallel: number;
  /** オーケストレーション並列数 */
  maxOrchestrationParallel: number;
  /** 適応制御の有効/無効 */
  adaptiveEnabled: boolean;
  /** 予測スケジューリングの有効/無効 */
  predictiveEnabled: boolean;
}
```

## Dependency Injection

### setRuntimeSnapshotProvider()

ランタイムスナップショットプロバイダー関数を設定。extensions/agent-runtime.tsから初期化時に呼び出される。

```typescript
function setRuntimeSnapshotProvider(fn: RuntimeSnapshotProvider): void
```

## Main Functions

### getUnifiedEnvConfig()

統合環境変数設定を取得。

優先順位:
1. PI_LIMIT_* (新しい統一形式)
2. PI_AGENT_* (従来形式 - 後方互換性)
3. デフォルト値

```typescript
function getUnifiedEnvConfig(): UnifiedEnvConfig
```

### resolveUnifiedLimits()

統合制限解決のメイン関数。

制限計算チェーン:
1. プリセット制限を取得 (provider-limits)
2. 適応的調整を適用 (adaptive-rate-controller)
3. クロスインスタンス分散を適用 (cross-instance-coordinator)
4. ランタイム制約を適用 (環境変数 + 現在のアクティブ数)
5. 予測分析を追加 (オプション)

```typescript
function resolveUnifiedLimits(input: UnifiedLimitInput): UnifiedLimitResult
```

### formatUnifiedLimitsResult()

制限解決結果をフォーマット。

```typescript
function formatUnifiedLimitsResult(result: UnifiedLimitResult): string
```

### getAllLimitsSummary()

全プロバイダーの制限サマリーを取得。

```typescript
function getAllLimitsSummary(): string
```

## Environment Variables

### 新しい統一形式 (PI_LIMIT_*)

| 変数名 | 説明 | デフォルト |
|--------|------|----------|
| PI_LIMIT_MAX_TOTAL_LLM | 全体のLLM並列上限 | 8 |
| PI_LIMIT_MAX_TOTAL_REQUESTS | 全体のリクエスト並列上限 | 6 |
| PI_LIMIT_SUBAGENT_PARALLEL | サブエージェント並列数 | 4 |
| PI_LIMIT_TEAM_PARALLEL | チーム並列数 | 3 |
| PI_LIMIT_TEAMMATE_PARALLEL | チームメンバー並列数 | 6 |
| PI_LIMIT_ORCHESTRATION_PARALLEL | オーケストレーション並列数 | 4 |
| PI_LIMIT_ADAPTIVE_ENABLED | 適応制御の有効/無効 | true |
| PI_LIMIT_PREDICTIVE_ENABLED | 予測スケジューリングの有効/無効 | true |

### 従来形式 (PI_AGENT_*)

後方互換性のため維持。

## 使用例

```typescript
// 制限を解決
const result = resolveUnifiedLimits({
  provider: "anthropic",
  model: "claude-sonnet-4",
  operationType: "subagent",
  priority: "high",
});

console.log(`Effective concurrency: ${result.effectiveConcurrency}`);
console.log(`Limiting factor: ${result.limitingFactor}`);
console.log(`Reason: ${result.limitingReason}`);

// デバッグ用内訳
console.log(formatUnifiedLimitsResult(result));
```

## 関連ファイル

- `.pi/lib/provider-limits.ts` - プロバイダー制限
- `.pi/lib/adaptive-rate-controller.ts` - 適応レートコントローラ
- `.pi/lib/cross-instance-coordinator.ts` - クロスインスタンスコーディネータ
- `.pi/extensions/agent-runtime.ts` - エージェントランタイム
