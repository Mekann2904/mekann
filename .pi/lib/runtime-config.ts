/**
 * @abdd.meta
 * path: .pi/lib/runtime-config.ts
 * role: ランタイム設定の型定義およびプロファイルプリセットの管理
 * why: 全レイヤーで一貫した設定を維持し、設定の漂流を防止するため
 * related: .pi/lib/unified-limit-resolver.ts, .pi/extensions/agent-runtime.ts, .pi/lib/adaptive-rate-controller.ts, .pi/lib/cross-instance-coordinator.ts
 * public_api: RuntimeProfile, RuntimeConfig, PROFILE_PRESETS
 * invariants: プロファイル設定はRuntimeConfig型の構造に準拠する、数値設定は各プロファイルの目的に応じた範囲内である
 * side_effects: なし（静的な定義と定数のみ）
 * failure_modes: 不正なプロファイルキーが指定された場合の参照エラー、設定値の型不一致
 * @abdd.explain
 * overview: 実行時の動作制御（並列数、レート制御、スケジューリング等）の集中管理定義
 * what_it_does:
 *   - ランタイムプロファイル（stable, default）と設定インターフェースを定義する
 *   - 各プロファイルに応じた設定のプリセット（定数）を提供する
 * why_it_exists:
 *   - 複数のレイヤー間で設定が乖離しないよう、設定値のSingle Source of Truthを提供する
 *   - 信頼性重視（stable）とバランス型（default）の運用モードを明確に切り替えるため
 * scope:
 *   in: なし
 *   out: RuntimeConfig型オブジェクト、プロファイルプリセット設定
 */

/**
 * Runtime Configuration
 *
 * Centralized runtime configuration for all layers.
 * Ensures consistent settings across provider-limits, adaptive-rate-controller,
 * cross-instance-coordinator, agent-runtime, and task-scheduler.
 *
 * Why: Prevents configuration drift between layers
 * Related: lib/unified-limit-resolver.ts, extensions/agent-runtime.ts
 */

// ============================================================================
// Types
// ============================================================================

/**
 * ランタイムプロファイルの型定義
 * @summary プロファイル型
 */
export type RuntimeProfile = "stable" | "default";

/**
 * ランタイム設定のインターフェース
 * @summary 設定インターフェース
 */
export interface RuntimeConfig {
  /** Runtime profile mode */
  profile: RuntimeProfile;

  /** Total max LLM operations across all instances */
  totalMaxLlm: number;

  /** Total max requests across all instances */
  totalMaxRequests: number;

  /** Max parallel subagents per run */
  maxParallelSubagents: number;

  /** Max parallel teams per run */
  maxParallelTeams: number;

  /** Max parallel teammates per team */
  maxParallelTeammates: number;

  /** Max concurrent orchestrations */
  maxConcurrentOrchestrations: number;

  /** Adaptive rate control enabled */
  adaptiveEnabled: boolean;

  /** Predictive scheduling enabled */
  predictiveEnabled: boolean;

  /** Heartbeat interval in ms */
  heartbeatIntervalMs: number;

  /** Heartbeat timeout in ms */
  heartbeatTimeoutMs: number;

  /** Recovery interval for adaptive controller in ms */
  recoveryIntervalMs: number;

  /** Reduction factor on 429 (0.7 = 30% reduction) */
  reductionFactor: number;

  /** Recovery factor (1.1 = 10% increase per recovery) */
  recoveryFactor: number;

  /** Max concurrent per model for task scheduler */
  maxConcurrentPerModel: number;

  /** Max total concurrent for task scheduler */
  maxTotalConcurrent: number;

  /** Capacity wait timeout in ms */
  capacityWaitMs: number;

  /** Capacity poll interval in ms */
  capacityPollMs: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Profile presets.
 */
const PROFILE_PRESETS: Record<RuntimeProfile, Omit<RuntimeConfig, "profile">> = {
  stable: {
    totalMaxLlm: 4,
    totalMaxRequests: 2,
    maxParallelSubagents: 2,
    maxParallelTeams: 1,
    maxParallelTeammates: 3,
    maxConcurrentOrchestrations: 2,
    adaptiveEnabled: true,
    predictiveEnabled: true,
    heartbeatIntervalMs: 15_000,
    heartbeatTimeoutMs: 60_000,
    recoveryIntervalMs: 5 * 60_000, // 5 minutes
    reductionFactor: 0.7,
    recoveryFactor: 1.1,
    maxConcurrentPerModel: 2,
    maxTotalConcurrent: 4,
    capacityWaitMs: 12_000,
    capacityPollMs: 100,
  },
  default: {
    totalMaxLlm: 6,
    totalMaxRequests: 6,
    maxParallelSubagents: 4,
    maxParallelTeams: 3,
    maxParallelTeammates: 6,
    maxConcurrentOrchestrations: 4,
    adaptiveEnabled: true,
    predictiveEnabled: true,
    heartbeatIntervalMs: 15_000,
    heartbeatTimeoutMs: 60_000,
    recoveryIntervalMs: 5 * 60_000, // 5 minutes
    reductionFactor: 0.7,
    recoveryFactor: 1.1,
    maxConcurrentPerModel: 4,
    maxTotalConcurrent: 8,
    capacityWaitMs: 30_000,
    capacityPollMs: 100,
  },
};

// ============================================================================
// Environment Variable Mapping
// ============================================================================

/**
 * Environment variable names for configuration overrides.
 * Priority: PI_LIMIT_* > PI_AGENT_* > PI_TOTAL_* > profile defaults
 */
const ENV_MAPPING = {
  // New unified format (highest priority)
  PI_LIMIT_MAX_TOTAL_LLM: "totalMaxLlm" as const,
  PI_LIMIT_MAX_TOTAL_REQUESTS: "totalMaxRequests" as const,
  PI_LIMIT_SUBAGENT_PARALLEL: "maxParallelSubagents" as const,
  PI_LIMIT_TEAM_PARALLEL: "maxParallelTeams" as const,
  PI_LIMIT_TEAMMATE_PARALLEL: "maxParallelTeammates" as const,
  PI_LIMIT_ORCHESTRATION_PARALLEL: "maxConcurrentOrchestrations" as const,
  PI_LIMIT_ADAPTIVE_ENABLED: "adaptiveEnabled" as const,
  PI_LIMIT_PREDICTIVE_ENABLED: "predictiveEnabled" as const,

  // Legacy format (medium priority)
  PI_AGENT_MAX_TOTAL_LLM: "totalMaxLlm" as const,
  PI_AGENT_MAX_TOTAL_REQUESTS: "totalMaxRequests" as const,
  PI_AGENT_MAX_PARALLEL_SUBAGENTS: "maxParallelSubagents" as const,
  PI_AGENT_MAX_PARALLEL_TEAMS: "maxParallelTeams" as const,
  PI_AGENT_MAX_PARALLEL_TEAMMATES: "maxParallelTeammates" as const,
  PI_AGENT_MAX_CONCURRENT_ORCHESTRATIONS: "maxConcurrentOrchestrations" as const,

  // Cross-instance legacy (lower priority)
  PI_TOTAL_MAX_LLM: "totalMaxLlm" as const,
  PI_HEARTBEAT_INTERVAL_MS: "heartbeatIntervalMs" as const,
  PI_HEARTBEAT_TIMEOUT_MS: "heartbeatTimeoutMs" as const,

  // Capacity settings
  PI_AGENT_CAPACITY_WAIT_MS: "capacityWaitMs" as const,
  PI_AGENT_CAPACITY_POLL_MS: "capacityPollMs" as const,
};

// ============================================================================
// State
// ============================================================================

let cachedConfig: RuntimeConfig | null = null;
let configVersion = 0;

// ============================================================================
// Utilities
// ============================================================================

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === "1" || value.toLowerCase() === "true";
}

function parseNumber(value: string | undefined, min?: number, max?: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  if (min !== undefined && parsed < min) return undefined;
  if (max !== undefined && parsed > max) return undefined;
  return parsed;
}

function detectProfile(): RuntimeProfile {
  const envProfile = process.env.PI_RUNTIME_PROFILE?.toLowerCase();
  if (envProfile === "stable" || process.env.STABLE_RUNTIME_PROFILE === "true") {
    return "stable";
  }
  return "default";
}

// ============================================================================
// Public API
// ============================================================================

/**
 * ランタイム設定取得
 * @summary 設定取得
 * @returns キャッシュされたランタイム設定
 */
export function getRuntimeConfig(): RuntimeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const profile = detectProfile();
  const baseConfig = PROFILE_PRESETS[profile];

  const config: RuntimeConfig = {
    profile,
    ...baseConfig,
  };

  // Apply environment overrides in priority order

  // Lowest priority: PI_TOTAL_* and PI_HEARTBEAT_*
  if (process.env.PI_TOTAL_MAX_LLM !== undefined) {
    const val = parseNumber(process.env.PI_TOTAL_MAX_LLM, 1, 64);
    if (val !== undefined) config.totalMaxLlm = val;
  }
  if (process.env.PI_HEARTBEAT_INTERVAL_MS !== undefined) {
    const val = parseNumber(process.env.PI_HEARTBEAT_INTERVAL_MS, 1000, 300000);
    if (val !== undefined) config.heartbeatIntervalMs = val;
  }
  if (process.env.PI_HEARTBEAT_TIMEOUT_MS !== undefined) {
    const val = parseNumber(process.env.PI_HEARTBEAT_TIMEOUT_MS, 10000, 600000);
    if (val !== undefined) config.heartbeatTimeoutMs = val;
  }

  // Medium priority: PI_AGENT_*
  if (process.env.PI_AGENT_MAX_TOTAL_LLM !== undefined) {
    const val = parseNumber(process.env.PI_AGENT_MAX_TOTAL_LLM, 1, 64);
    if (val !== undefined) config.totalMaxLlm = val;
  }
  if (process.env.PI_AGENT_MAX_TOTAL_REQUESTS !== undefined) {
    const val = parseNumber(process.env.PI_AGENT_MAX_TOTAL_REQUESTS, 1, 64);
    if (val !== undefined) config.totalMaxRequests = val;
  }
  if (process.env.PI_AGENT_MAX_PARALLEL_SUBAGENTS !== undefined) {
    const val = parseNumber(process.env.PI_AGENT_MAX_PARALLEL_SUBAGENTS, 1, 64);
    if (val !== undefined) config.maxParallelSubagents = val;
  }
  if (process.env.PI_AGENT_MAX_PARALLEL_TEAMS !== undefined) {
    const val = parseNumber(process.env.PI_AGENT_MAX_PARALLEL_TEAMS, 1, 64);
    if (val !== undefined) config.maxParallelTeams = val;
  }
  if (process.env.PI_AGENT_MAX_PARALLEL_TEAMMATES !== undefined) {
    const val = parseNumber(process.env.PI_AGENT_MAX_PARALLEL_TEAMMATES, 1, 64);
    if (val !== undefined) config.maxParallelTeammates = val;
  }
  if (process.env.PI_AGENT_MAX_CONCURRENT_ORCHESTRATIONS !== undefined) {
    const val = parseNumber(process.env.PI_AGENT_MAX_CONCURRENT_ORCHESTRATIONS, 1, 16);
    if (val !== undefined) config.maxConcurrentOrchestrations = val;
  }
  if (process.env.PI_AGENT_CAPACITY_WAIT_MS !== undefined) {
    const val = parseNumber(process.env.PI_AGENT_CAPACITY_WAIT_MS, 1000, 3600000);
    if (val !== undefined) config.capacityWaitMs = val;
  }
  if (process.env.PI_AGENT_CAPACITY_POLL_MS !== undefined) {
    const val = parseNumber(process.env.PI_AGENT_CAPACITY_POLL_MS, 10, 60000);
    if (val !== undefined) config.capacityPollMs = val;
  }

  // Highest priority: PI_LIMIT_*
  if (process.env.PI_LIMIT_MAX_TOTAL_LLM !== undefined) {
    const val = parseNumber(process.env.PI_LIMIT_MAX_TOTAL_LLM, 1, 64);
    if (val !== undefined) config.totalMaxLlm = val;
  }
  if (process.env.PI_LIMIT_MAX_TOTAL_REQUESTS !== undefined) {
    const val = parseNumber(process.env.PI_LIMIT_MAX_TOTAL_REQUESTS, 1, 64);
    if (val !== undefined) config.totalMaxRequests = val;
  }
  if (process.env.PI_LIMIT_SUBAGENT_PARALLEL !== undefined) {
    const val = parseNumber(process.env.PI_LIMIT_SUBAGENT_PARALLEL, 1, 64);
    if (val !== undefined) config.maxParallelSubagents = val;
  }
  if (process.env.PI_LIMIT_TEAM_PARALLEL !== undefined) {
    const val = parseNumber(process.env.PI_LIMIT_TEAM_PARALLEL, 1, 64);
    if (val !== undefined) config.maxParallelTeams = val;
  }
  if (process.env.PI_LIMIT_TEAMMATE_PARALLEL !== undefined) {
    const val = parseNumber(process.env.PI_LIMIT_TEAMMATE_PARALLEL, 1, 64);
    if (val !== undefined) config.maxParallelTeammates = val;
  }
  if (process.env.PI_LIMIT_ORCHESTRATION_PARALLEL !== undefined) {
    const val = parseNumber(process.env.PI_LIMIT_ORCHESTRATION_PARALLEL, 1, 16);
    if (val !== undefined) config.maxConcurrentOrchestrations = val;
  }
  if (process.env.PI_LIMIT_ADAPTIVE_ENABLED !== undefined) {
    const val = parseBoolean(process.env.PI_LIMIT_ADAPTIVE_ENABLED);
    if (val !== undefined) config.adaptiveEnabled = val;
  }
  if (process.env.PI_LIMIT_PREDICTIVE_ENABLED !== undefined) {
    const val = parseBoolean(process.env.PI_LIMIT_PREDICTIVE_ENABLED);
    if (val !== undefined) config.predictiveEnabled = val;
  }

  cachedConfig = config;
  configVersion++;

  return config;
}

/**
 * 設定バージョンを取得
 * @summary バージョン取得
 * @returns 現在の設定バージョン番号
 */
export function getConfigVersion(): number {
  return configVersion;
}

/**
 * ランタイム設定を再読込
 * @summary 設定再読込
 * @returns 最新のランタイム設定
 */
export function reloadRuntimeConfig(): RuntimeConfig {
  cachedConfig = null;
  return getRuntimeConfig();
}

/**
 * 現在のランタイムプロファイルを取得する
 * @summary プロファイル取得
 * @returns 現在のプロファイル
 */
export function getRuntimeProfile(): RuntimeProfile {
  return getRuntimeConfig().profile;
}

/**
 * 安定版プロファイルか判定する
 * @summary 安定版判定
 * @returns 安定版の場合はtrue
 */
export function isStableProfile(): boolean {
  return getRuntimeConfig().profile === "stable";
}

/**
 * 設定の一貫性を検証する
 * @summary 設定整合性チェック
 * @returns 検証結果（整合性情報）
 */
export function validateConfigConsistency(): {
  consistent: boolean;
  warnings: string[];
  details: Record<string, unknown>;
} {
  const config = getRuntimeConfig();
  const warnings: string[] = [];

  // Check for conflicting environment variables
  const hasPiLimitTotalLlm = process.env.PI_LIMIT_MAX_TOTAL_LLM !== undefined;
  const hasPiAgentTotalLlm = process.env.PI_AGENT_MAX_TOTAL_LLM !== undefined;
  const hasPiTotalMaxLlm = process.env.PI_TOTAL_MAX_LLM !== undefined;

  if (hasPiLimitTotalLlm && hasPiAgentTotalLlm) {
    warnings.push(
      "Both PI_LIMIT_MAX_TOTAL_LLM and PI_AGENT_MAX_TOTAL_LLM are set. " +
      "PI_LIMIT_MAX_TOTAL_LLM takes precedence."
    );
  }
  if (hasPiAgentTotalLlm && hasPiTotalMaxLlm) {
    warnings.push(
      "Both PI_AGENT_MAX_TOTAL_LLM and PI_TOTAL_MAX_LLM are set. " +
      "PI_AGENT_MAX_TOTAL_LLM takes precedence."
    );
  }

  // Check for potentially problematic combinations
  if (config.maxParallelSubagents > config.totalMaxLlm) {
    warnings.push(
      `maxParallelSubagents (${config.maxParallelSubagents}) > totalMaxLlm (${config.totalMaxLlm}). ` +
      "Subagent parallelism will be limited by totalMaxLlm."
    );
  }

  if (config.maxParallelTeams * config.maxParallelTeammates > config.totalMaxLlm) {
    warnings.push(
      `maxParallelTeams * maxParallelTeammates (${config.maxParallelTeams} * ${config.maxParallelTeammates}) ` +
      `> totalMaxLlm (${config.totalMaxLlm}). Team parallelism will be limited.`
    );
  }

  return {
    consistent: warnings.length === 0,
    warnings,
    details: {
      profile: config.profile,
      totalMaxLlm: config.totalMaxLlm,
      totalMaxRequests: config.totalMaxRequests,
      maxParallelSubagents: config.maxParallelSubagents,
      maxParallelTeams: config.maxParallelTeams,
      maxParallelTeammates: config.maxParallelTeammates,
      maxConcurrentOrchestrations: config.maxConcurrentOrchestrations,
      envVarsSet: Object.keys(ENV_MAPPING).filter((k) => process.env[k] !== undefined),
    },
  };
}

/**
 * ランタイム設定を整形する
 * @summary 設定文字列化
 * @returns 整形された設定文字列
 */
export function formatRuntimeConfig(): string {
  const config = getRuntimeConfig();
  const validation = validateConfigConsistency();

  const lines: string[] = [
    `Runtime Configuration (profile: ${config.profile})`,
    "=".repeat(50),
    "",
    "Concurrency Limits:",
    `  totalMaxLlm: ${config.totalMaxLlm}`,
    `  totalMaxRequests: ${config.totalMaxRequests}`,
    `  maxParallelSubagents: ${config.maxParallelSubagents}`,
    `  maxParallelTeams: ${config.maxParallelTeams}`,
    `  maxParallelTeammates: ${config.maxParallelTeammates}`,
    `  maxConcurrentOrchestrations: ${config.maxConcurrentOrchestrations}`,
    "",
    "Task Scheduler:",
    `  maxConcurrentPerModel: ${config.maxConcurrentPerModel}`,
    `  maxTotalConcurrent: ${config.maxTotalConcurrent}`,
    "",
    "Cross-Instance:",
    `  heartbeatIntervalMs: ${config.heartbeatIntervalMs}`,
    `  heartbeatTimeoutMs: ${config.heartbeatTimeoutMs}`,
    "",
    "Adaptive Control:",
    `  adaptiveEnabled: ${config.adaptiveEnabled}`,
    `  predictiveEnabled: ${config.predictiveEnabled}`,
    `  recoveryIntervalMs: ${config.recoveryIntervalMs}`,
    `  reductionFactor: ${config.reductionFactor}`,
    `  recoveryFactor: ${config.recoveryFactor}`,
    "",
    "Capacity:",
    `  capacityWaitMs: ${config.capacityWaitMs}`,
    `  capacityPollMs: ${config.capacityPollMs}`,
  ];

  if (validation.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of validation.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join("\n");
}
