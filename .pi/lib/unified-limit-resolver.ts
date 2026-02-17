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
import type { IRuntimeSnapshot, RuntimeSnapshotProvider } from "./interfaces/runtime-snapshot.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 制限解決の入力パラメータ
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

/**
 * 統合環境変数設定
 */
export interface UnifiedEnvConfig {
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

// ============================================================================
// Dependency Injection (DIP Compliance)
// ============================================================================

/**
 * Runtime snapshot provider for dependency injection.
 * Allows extensions layer to inject concrete implementation.
 */
let _getRuntimeSnapshot: RuntimeSnapshotProvider | null = null;

/**
 * Set the runtime snapshot provider function.
 * Called by extensions/agent-runtime.ts during initialization.
 */
export function setRuntimeSnapshotProvider(fn: RuntimeSnapshotProvider): void {
  _getRuntimeSnapshot = fn;
}

/**
 * Get runtime snapshot with fallback to default values.
 * Internal function used by resolveUnifiedLimits.
 */
function getRuntimeSnapshot(): IRuntimeSnapshot {
  if (!_getRuntimeSnapshot) {
    // Fallback: return default values when not initialized
    return {
      totalActiveLlm: 0,
      totalActiveRequests: 0,
      subagentActiveCount: 0,
      teamActiveCount: 0,
    };
  }
  return _getRuntimeSnapshot();
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ENV_CONFIG: UnifiedEnvConfig = {
  maxTotalLlm: 8,
  maxTotalRequests: 6,
  maxSubagentParallel: 4,
  maxTeamParallel: 3,
  maxTeammateParallel: 6,
  maxOrchestrationParallel: 4,
  adaptiveEnabled: true,
  predictiveEnabled: true,
};

// ============================================================================
// Environment Variable Resolution
// ============================================================================

/**
 * 統合環境変数設定を取得
 * 
 * 優先順位:
 * 1. PI_LIMIT_* (新しい統一形式)
 * 2. PI_AGENT_* (従来形式 - 後方互換性)
 * 3. デフォルト値
 */
export function getUnifiedEnvConfig(): UnifiedEnvConfig {
  const config = { ...DEFAULT_ENV_CONFIG };

  // 新しい統一形式 (PI_LIMIT_*)
  if (process.env.PI_LIMIT_MAX_TOTAL_LLM) {
    config.maxTotalLlm = parseInt(process.env.PI_LIMIT_MAX_TOTAL_LLM, 10);
  }
  if (process.env.PI_LIMIT_MAX_TOTAL_REQUESTS) {
    config.maxTotalRequests = parseInt(process.env.PI_LIMIT_MAX_TOTAL_REQUESTS, 10);
  }
  if (process.env.PI_LIMIT_SUBAGENT_PARALLEL) {
    config.maxSubagentParallel = parseInt(process.env.PI_LIMIT_SUBAGENT_PARALLEL, 10);
  }
  if (process.env.PI_LIMIT_TEAM_PARALLEL) {
    config.maxTeamParallel = parseInt(process.env.PI_LIMIT_TEAM_PARALLEL, 10);
  }
  if (process.env.PI_LIMIT_TEAMMATE_PARALLEL) {
    config.maxTeammateParallel = parseInt(process.env.PI_LIMIT_TEAMMATE_PARALLEL, 10);
  }
  if (process.env.PI_LIMIT_ORCHESTRATION_PARALLEL) {
    config.maxOrchestrationParallel = parseInt(process.env.PI_LIMIT_ORCHESTRATION_PARALLEL, 10);
  }
  if (process.env.PI_LIMIT_ADAPTIVE_ENABLED !== undefined) {
    config.adaptiveEnabled = process.env.PI_LIMIT_ADAPTIVE_ENABLED === "1" || process.env.PI_LIMIT_ADAPTIVE_ENABLED === "true";
  }
  if (process.env.PI_LIMIT_PREDICTIVE_ENABLED !== undefined) {
    config.predictiveEnabled = process.env.PI_LIMIT_PREDICTIVE_ENABLED === "1" || process.env.PI_LIMIT_PREDICTIVE_ENABLED === "true";
  }

  // 従来形式 (PI_AGENT_*) - 後方互換性
  if (process.env.PI_AGENT_MAX_TOTAL_LLM && !process.env.PI_LIMIT_MAX_TOTAL_LLM) {
    config.maxTotalLlm = parseInt(process.env.PI_AGENT_MAX_TOTAL_LLM, 10);
  }
  if (process.env.PI_AGENT_MAX_TOTAL_REQUESTS && !process.env.PI_LIMIT_MAX_TOTAL_REQUESTS) {
    config.maxTotalRequests = parseInt(process.env.PI_AGENT_MAX_TOTAL_REQUESTS, 10);
  }
  if (process.env.PI_AGENT_MAX_PARALLEL_SUBAGENTS && !process.env.PI_LIMIT_SUBAGENT_PARALLEL) {
    config.maxSubagentParallel = parseInt(process.env.PI_AGENT_MAX_PARALLEL_SUBAGENTS, 10);
  }
  if (process.env.PI_AGENT_MAX_PARALLEL_TEAMS && !process.env.PI_LIMIT_TEAM_PARALLEL) {
    config.maxTeamParallel = parseInt(process.env.PI_AGENT_MAX_PARALLEL_TEAMS, 10);
  }
  if (process.env.PI_AGENT_MAX_PARALLEL_TEAMMATES && !process.env.PI_LIMIT_TEAMMATE_PARALLEL) {
    config.maxTeammateParallel = parseInt(process.env.PI_AGENT_MAX_PARALLEL_TEAMMATES, 10);
  }
  if (process.env.PI_AGENT_MAX_CONCURRENT_ORCHESTRATIONS && !process.env.PI_LIMIT_ORCHESTRATION_PARALLEL) {
    config.maxOrchestrationParallel = parseInt(process.env.PI_AGENT_MAX_CONCURRENT_ORCHESTRATIONS, 10);
  }

  // クロスインスタンス従来形式
  if (process.env.PI_TOTAL_MAX_LLM && !process.env.PI_LIMIT_MAX_TOTAL_LLM && !process.env.PI_AGENT_MAX_TOTAL_LLM) {
    config.maxTotalLlm = parseInt(process.env.PI_TOTAL_MAX_LLM, 10);
  }

  return config;
}

// ============================================================================
// Unified Limit Resolver
// ============================================================================

/**
 * 統合制限解決のメイン関数
 * 
 * 制限計算チェーン:
 * 1. プリセット制限を取得 (provider-limits)
 * 2. 適応的調整を適用 (adaptive-rate-controller)
 * 3. クロスインスタンス分散を適用 (cross-instance-coordinator)
 * 4. ランタイム制約を適用 (環境変数 + 現在のアクティブ数)
 * 5. 予測分析を追加 (オプション)
 */
export function resolveUnifiedLimits(input: UnifiedLimitInput): UnifiedLimitResult {
  const { provider, model, tier } = input;
  const envConfig = getUnifiedEnvConfig();
  
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
  const runtimeMax = envConfig.maxTotalLlm;
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
 * 制限解決結果をフォーマット
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
 */
export function getAllLimitsSummary(): string {
  const envConfig = getUnifiedEnvConfig();
  const coordinatorStatus = getCoordinatorStatus();
  
  const lines: string[] = [
    `Unified Limit Resolver Summary`,
    `================================`,
    ``,
    `Environment Config:`,
    `  maxTotalLlm: ${envConfig.maxTotalLlm}`,
    `  maxTotalRequests: ${envConfig.maxTotalRequests}`,
    `  maxSubagentParallel: ${envConfig.maxSubagentParallel}`,
    `  maxTeamParallel: ${envConfig.maxTeamParallel}`,
    `  maxTeammateParallel: ${envConfig.maxTeammateParallel}`,
    `  maxOrchestrationParallel: ${envConfig.maxOrchestrationParallel}`,
    `  adaptiveEnabled: ${envConfig.adaptiveEnabled}`,
    `  predictiveEnabled: ${envConfig.predictiveEnabled}`,
    ``,
    `Cross-Instance Status:`,
    `  activeInstances: ${coordinatorStatus.activeInstanceCount || 1}`,
    `  registered: ${coordinatorStatus.registered || false}`,
  ];
  
  return lines.join("\n");
}
