/**
 * @abdd.meta
 * path: .pi/lib/unified-limit-resolver.ts
 * role: 5層の並列数制限計算を統合するfacadeレイヤー
 * why: プリセット、適応学習、クロスインスタンス分散、ランタイム制約を単一インターフェースで提供し、制限計算の複雑性を隠蔽するため
 * related: provider-limits.ts, adaptive-rate-controller.ts, cross-instance-coordinator.ts, runtime-config.ts
 * public_api: UnifiedLimitInput, LimitBreakdown, UnifiedLimitResult
 * invariants: 戻り値の並列数は常に正の整数、各層の制限値は非負、最終有効制限は全層の最小値以下
 * side_effects: 依存モジュール経由で429履歴の読み取り、インスタンス状態の参照、ランタイム設定の検証を実行
 * failure_modes: RuntimeSnapshotProviderが未注入時は警告ログを出力してデフォルト値を使用
 * @abdd.explain
 * overview: 複数の制限ソース(Layer 1-5)を統合し、provider/model/tier/priorityに基づいて最終的な並列数制限を算出する
 * what_it_does:
 *   - プリセット制限、適応調整、クロスインスタンス分散、ランタイム制約を集約
 *   - 各層の内訳をLimitBreakdownとして提供し、制約要因を特定
 *   - 予測分析を含む将来の429確率見積もりを提供
 * why_it_exists:
 *   - 複数モジュールに分散した制限計算ロジックを単一エントリポイントで管理
 *   - デバッグ時にどの層が制約になったかを追跡可能にする
 * scope:
 *   in: provider名、model名、tier(任意)、operationType(任意)、priority(任意)
 *   out: 最終有効並列数、有効RPM、有効TPM、各層の内訳、制約要因
 */

/**
 * Unified Limit Resolver
 *
 * 5層の並列数制限計算を統合するfacadeレイヤー。
 * プリセット、適応学習、クロスインスタンス分散、ランタイム制約を
 * 単一のインターフェースで提供する。
 *
 * Architecture:
 * Layer 1: provider-limits.ts (プリセット制限)
 * Layer 2: adaptive-rate-controller.ts (429学習による調整)
 * Layer 3: cross-instance-coordinator.ts (インスタンス間分散)
 * Layer 4: agent-runtime.ts (ランタイム制約)
 * Layer 5: task-scheduler.ts (優先度ベーススケジューリング)
 *
 * Initialization Order (IMPORTANT):
 * 1. Runtime config is loaded first (no dependencies)
 * 2. Cross-instance coordinator registers on session start
 * 3. Agent runtime extension injects snapshot provider
 * 4. This resolver combines all layers
 *
 * If snapshot provider is not injected, a warning is logged and defaults are used.
 */


import {
  getEffectiveLimit,
  getPredictiveAnalysis,
  type PredictiveAnalysis,
} from "./adaptive-rate-controller.js";
import {
  getMyParallelLimit,
  getModelParallelLimit,
  getCoordinatorStatus,
  type InstanceInfo,
} from "./cross-instance-coordinator.js";
import {
  resolveLimits,
  getConcurrencyLimit,
  getRpmLimit,
  type ResolvedModelLimits,
} from "./provider-limits.js";
import {
  getRuntimeConfig,
  validateConfigConsistency,
  type RuntimeConfig,
} from "./runtime-config.js";
import type { IRuntimeSnapshot, RuntimeSnapshotProvider } from "./interfaces/runtime-snapshot.js";

// ============================================================================
// Types (RuntimeConfig is imported from runtime-config.ts)
// ============================================================================

 /**
  * 制限解決の入力パラメータ
  * @param provider プロバイダー名 (例: "anthropic", "openai")
  * @param model モデル名 (例: "claude-sonnet-4-20250514")
  * @param tier ティア (例: "pro", "max") - 省略時は自動検出
  * @param operationType 操作タイプ - サブエージェント/チーム/オーケストレーション
  * @param priority タスク優先度
  */
export interface UnifiedLimitInput {
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

 /**
  * 各レイヤーの制限内訳
  * @param preset Layer 1: プリセット制限
  * @param adaptive Layer 2: 適応的調整
  * @param crossInstance Layer 3: クロスインスタンス調整
  * @param runtime Layer 4: ランタイム調整
  * @param prediction Layer 5: 予測モデル
  */
export interface LimitBreakdown {
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

 /**
  * 制限解決の結果
  * @param effectiveConcurrency 最終的な有効並列数
  * @param effectiveRpm 最終的な有効RPM
  * @param effectiveTpm 最終的な有効TPM（利用可能な場合）
  * @param breakdown 各レイヤーの内訳（デバッグ用）
  * @param limitingFactor 最も制約となったレイヤー
  * @param limitingReason 制約の理由
  */
export interface UnifiedLimitResult {
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

// ============================================================================
// Dependency Injection (DIP Compliance)
// ============================================================================

/**
 * Runtime snapshot provider for dependency injection.
 * Allows extensions layer to inject concrete implementation.
 */
let _getRuntimeSnapshot: RuntimeSnapshotProvider | null = null;

/**
 * Track initialization state for diagnostics.
 */
let _initializationState: {
  snapshotProviderSet: boolean;
  setAt: string | null;
  warningsLogged: string[];
} = {
  snapshotProviderSet: false,
  setAt: null,
  warningsLogged: [],
};

 /**
  * ランタイムスナップショットプロバイダを設定する。
  * @param fn ランタイムスナップショットを提供する関数
  * @returns なし
  */
export function setRuntimeSnapshotProvider(fn: RuntimeSnapshotProvider): void {
  const previousState = _getRuntimeSnapshot !== null;
  _getRuntimeSnapshot = fn;
  _initializationState.snapshotProviderSet = true;
  _initializationState.setAt = new Date().toISOString();

  if (previousState) {
    const warning = "Runtime snapshot provider was set multiple times. This may indicate a bug.";
    _initializationState.warningsLogged.push(warning);
    if (typeof console !== "undefined" && console.warn) {
      console.warn(`[unified-limit-resolver] ${warning}`);
    }
  }
}

 /**
  * ランタイムスナップショットプロバイダーが初期化済みか確認
  * @returns 初化済みの場合はtrue
  */
export function isSnapshotProviderInitialized(): boolean {
  return _initializationState.snapshotProviderSet;
}

 /**
  * 初期化状態を取得する（診断用）。
  * @returns 初期化状態のコピー
  */
export function getInitializationState(): typeof _initializationState {
  return { ..._initializationState };
}

/**
 * Get runtime snapshot with fallback to default values.
 * Internal function used by resolveUnifiedLimits.
 *
 * If the snapshot provider is not initialized, logs a warning once
 * and returns default values (all zeros).
 */
function getRuntimeSnapshot(): IRuntimeSnapshot {
  if (!_getRuntimeSnapshot) {
    // Log warning once
    if (!_initializationState.warningsLogged.includes("snapshot_provider_not_set")) {
      _initializationState.warningsLogged.push("snapshot_provider_not_set");
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          "[unified-limit-resolver] Runtime snapshot provider not initialized. " +
          "Using default values (0 active). " +
          "This may indicate agent-runtime extension is not loaded yet."
        );
      }
    }

    // Return default values when not initialized
    return {
      totalActiveLlm: 0,
      totalActiveRequests: 0,
      subagentActiveCount: 0,
      teamActiveCount: 0,
    };
  }

  try {
    return _getRuntimeSnapshot();
  } catch (error) {
    // Handle errors gracefully
    if (typeof console !== "undefined" && console.error) {
      console.error("[unified-limit-resolver] Error getting runtime snapshot:", error);
    }
    return {
      totalActiveLlm: 0,
      totalActiveRequests: 0,
      subagentActiveCount: 0,
      teamActiveCount: 0,
    };
  }
}

// ============================================================================
// Constants (Now using RuntimeConfig from runtime-config.ts)
// ============================================================================

 /**
  * 下位互換用エイリアス。
  * @deprecated 代わりに runtime-config.ts の RuntimeConfig を使用してください。
  */
export type UnifiedEnvConfig = RuntimeConfig;

 /**
  * 統合環境設定を取得
  * @returns 統合環境設定
  */
export function getUnifiedEnvConfig(): UnifiedEnvConfig {
  return getRuntimeConfig();
}

// ============================================================================
// Unified Limit Resolver
// ============================================================================

 /**
  * 統合制限を解決する
  * @param input プロバイダ、モデル、ティアを含む入力
  * @returns 解決された統合制限の結果
  */
export function resolveUnifiedLimits(input: UnifiedLimitInput): UnifiedLimitResult {
  const { provider, model, tier } = input;
  const envConfig = getRuntimeConfig();
  
  // Layer 1: プリセット制限
  const presetLimits = resolveLimits(provider, model, tier);
  const presetConcurrency = presetLimits.concurrency || 4;
  const presetRpm = presetLimits.rpm || 100;
  
  // Layer 2: 適応的調整
  let adaptiveConcurrency = presetConcurrency;
  let adaptiveMultiplier = 1.0;
  let historical429s = 0;
  let predicted429Probability = 0;
  
  if (envConfig.adaptiveEnabled) {
    adaptiveConcurrency = getEffectiveLimit(provider, model, presetConcurrency);
    adaptiveMultiplier = presetConcurrency > 0 ? adaptiveConcurrency / presetConcurrency : 1.0;
    
    // 予測分析を取得
    const predictiveAnalysis = getPredictiveAnalysis(provider, model);
    historical429s = predictiveAnalysis.historical429Count;
    predicted429Probability = predictiveAnalysis.predicted429Probability;
  }
  
  // Layer 3: クロスインスタンス分散
  const coordinatorStatus = getCoordinatorStatus();
  const activeInstances = coordinatorStatus.activeInstanceCount || 1;

  let crossInstanceConcurrency = adaptiveConcurrency;
  if (activeInstances > 1) {
    crossInstanceConcurrency = getModelParallelLimit(provider, model, adaptiveConcurrency);
  }
  
  // Layer 4: ランタイム制約
  const runtimeMax = envConfig.totalMaxLlm;
  const runtimeSnapshot = getRuntimeSnapshot();
  const currentActive = runtimeSnapshot.totalActiveLlm;
  const runtimeConcurrency = Math.min(crossInstanceConcurrency, runtimeMax);
  
  // 最終的な制限を決定
  const effectiveConcurrency = Math.max(1, Math.floor(runtimeConcurrency));
  const effectiveRpm = Math.floor(presetRpm / activeInstances);
  
  // 制約要因を特定
  let limitingFactor: UnifiedLimitResult["limitingFactor"] = "preset";
  let limitingReason = "";
  
  if (runtimeConcurrency < crossInstanceConcurrency) {
    limitingFactor = "runtime";
    limitingReason = `ランタイム上限 (${runtimeMax}) がクロスインスタンス配分 (${crossInstanceConcurrency.toFixed(1)}) より低い`;
  } else if (crossInstanceConcurrency < adaptiveConcurrency) {
    limitingFactor = "cross_instance";
    limitingReason = `インスタンス分散: ${activeInstances} インスタンスで配分`;
  } else if (adaptiveConcurrency < presetConcurrency) {
    limitingFactor = "adaptive";
    limitingReason = `429学習による調整: ${(adaptiveMultiplier * 100).toFixed(0)}%`;
  } else {
    limitingFactor = "preset";
    limitingReason = `プリセット制限 (${presetConcurrency}) が適用`;
  }
  
  // 内訳を作成
  const breakdown: LimitBreakdown = {
    preset: {
      concurrency: presetConcurrency,
      rpm: presetRpm,
      tpm: presetLimits.tpm,
      source: presetLimits._sources?.concurrency || "builtin",
      tier: presetLimits._tier || "default",
    },
    adaptive: {
      multiplier: adaptiveMultiplier,
      learnedConcurrency: adaptiveConcurrency,
      historical429s,
      predicted429Probability,
    },
    crossInstance: {
      activeInstances,
      myShare: crossInstanceConcurrency,
    },
    runtime: {
      maxActive: runtimeMax,
      currentActive,
      available: Math.max(0, runtimeMax - currentActive),
    },
  };
  
  // 予測分析を追加（有効な場合）
  if (envConfig.predictiveEnabled) {
    breakdown.prediction = getPredictiveAnalysis(provider, model);
  }
  
  return {
    effectiveConcurrency,
    effectiveRpm,
    effectiveTpm: presetLimits.tpm ? Math.floor(presetLimits.tpm / activeInstances) : undefined,
    breakdown,
    limitingFactor,
    limitingReason,
    metadata: {
      provider,
      model,
      tier: presetLimits._tier || "default",
      resolvedAt: new Date().toISOString(),
    },
  };
}

 /**
  * 制限解決結果を文字列としてフォーマットする
  * @param result - フォーマット対象の制限解決結果
  * @returns フォーマット済みの文字列
  */
export function formatUnifiedLimitsResult(result: UnifiedLimitResult): string {
  const lines: string[] = [
    `Unified Limit Resolution: ${result.metadata.provider}/${result.metadata.model}`,
    `  Effective: concurrency=${result.effectiveConcurrency}, rpm=${result.effectiveRpm}`,
    `  Limiting factor: ${result.limitingFactor} - ${result.limitingReason}`,
    ``,
    `  Breakdown:`,
    `    Preset:    concurrency=${result.breakdown.preset.concurrency}, rpm=${result.breakdown.preset.rpm}, tier=${result.breakdown.preset.tier}`,
    `    Adaptive:  multiplier=${(result.breakdown.adaptive.multiplier * 100).toFixed(0)}%, 429s=${result.breakdown.adaptive.historical429s}`,
    `    Cross:     instances=${result.breakdown.crossInstance.activeInstances}, share=${result.breakdown.crossInstance.myShare.toFixed(1)}`,
    `    Runtime:   max=${result.breakdown.runtime.maxActive}`,
  ];
  
  if (result.breakdown.prediction) {
    lines.push(`    Prediction: 429_prob=${(result.breakdown.prediction.predicted429Probability * 100).toFixed(1)}%`);
  }
  
  return lines.join("\n");
}

 /**
  * 全プロバイダーの制限サマリーを取得
  * @returns 制限サマリーの文字列
  */
export function getAllLimitsSummary(): string {
  const envConfig = getRuntimeConfig();
  const coordinatorStatus = getCoordinatorStatus();
  const validation = validateConfigConsistency();
  
  const lines: string[] = [
    `Unified Limit Resolver Summary`,
    `================================`,
    ``,
    `Profile: ${envConfig.profile}`,
    ``,
    `Environment Config:`,
    `  totalMaxLlm: ${envConfig.totalMaxLlm}`,
    `  totalMaxRequests: ${envConfig.totalMaxRequests}`,
    `  maxParallelSubagents: ${envConfig.maxParallelSubagents}`,
    `  maxParallelTeams: ${envConfig.maxParallelTeams}`,
    `  maxParallelTeammates: ${envConfig.maxParallelTeammates}`,
    `  maxConcurrentOrchestrations: ${envConfig.maxConcurrentOrchestrations}`,
    `  adaptiveEnabled: ${envConfig.adaptiveEnabled}`,
    `  predictiveEnabled: ${envConfig.predictiveEnabled}`,
    ``,
    `Task Scheduler:`,
    `  maxConcurrentPerModel: ${envConfig.maxConcurrentPerModel}`,
    `  maxTotalConcurrent: ${envConfig.maxTotalConcurrent}`,
    ``,
    `Cross-Instance Status:`,
    `  activeInstances: ${coordinatorStatus.activeInstanceCount || 1}`,
    `  registered: ${coordinatorStatus.registered || false}`,
    ``,
    `Initialization:`,
    `  snapshotProviderSet: ${_initializationState.snapshotProviderSet}`,
    `  setAt: ${_initializationState.setAt || "not set"}`,
  ];

  if (validation.warnings.length > 0) {
    lines.push("", "Configuration Warnings:");
    for (const warning of validation.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  
  return lines.join("\n");
}
