/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/cortexdebate-config.ts
 * role: CortexDebate機能の設定管理とフィーチャーフラグ
 * why: 段階的ロールアウトと環境ごとの設定変更を可能にするため
 * related: ./mdm-modulator.ts, ./debate-graph.ts, ./team-orchestrator.ts
 * public_api: CortexDebateConfig, getCortexDebateConfig, isCortexDebateEnabled, clearConfigCache
 * invariants: 設定は環境変数またはデフォルト値から読み込まれる
 * side_effects: 環境変数の読み込み、設定キャッシュ
 * failure_modes: 不正な設定値に対するデフォルト値フォールバック
 * @abdd.explain
 * overview: CortexDebate機能の設定を管理するモジュール
 * what_it_does:
 *   - 環境変数からCortexDebateの設定を読み込む
 *   - フィーチャーフラグによる機能単位の有効/無効制御
 *   - 設定値のキャッシュによるパフォーマンス最適化
 * why_it_exists:
 *   - CortexDebate機能を安全にロールアウトするため
 *   - 本番環境での即座な無効化を可能にするため
 *   - テスト環境での設定分離を実現するため
 * scope:
 *   in: 環境変数（PI_CORTEXDEBATE_*）
 *   out: CortexDebateConfig設定オブジェクト
 */

import type { MDMConfig, SparsityConfig } from "./mdm-types";
import { createDefaultMDMConfig } from "./mdm-modulator";

/**
 * CortexDebateフィーチャーフラグ
 * @summary フィーチャーフラグ
 * @param useMDM MDM変調を使用するか
 * @param useSparseGraph スパースグラフを使用するか
 * @param useGraphConsensus グラフコンセンサス集約を使用するか
 * @param useEarlyTermination 収束時の早期終了を使用するか
 */
export interface CortexDebateFeatureFlags {
  useMDM: boolean;
  useSparseGraph: boolean;
  useGraphConsensus: boolean;
  useEarlyTermination: boolean;
}

/**
 * CortexDebate設定
 * @summary CortexDebate設定
 * @param enabled 機能全体の有効/無効
 * @param mdmConfig MDM設定
 * @param sparsityConfig スパースグラフ設定
 * @param maxRounds 最大ラウンド数
 * @param convergenceThreshold 収束閾値
 * @param featureFlags フィーチャーフラグ
 */
export interface CortexDebateConfig {
  enabled: boolean;
  mdmConfig: MDMConfig;
  sparsityConfig: SparsityConfig;
  maxRounds: number;
  convergenceThreshold: number;
  featureFlags: CortexDebateFeatureFlags;
}

/**
 * デフォルトCortexDebate設定
 */
const DEFAULT_CONFIG: CortexDebateConfig = {
  enabled: false,
  mdmConfig: createDefaultMDMConfig(),
  sparsityConfig: {
    targetDensity: 0.3,
    pruningStrategy: "adaptive",
    minEdgeWeight: 0.1,
    maxDegree: 5,
  },
  maxRounds: 5,
  convergenceThreshold: 0.85,
  featureFlags: {
    useMDM: true,
    useSparseGraph: true,
    useGraphConsensus: false, // Opt-in
    useEarlyTermination: true,
  },
};

/**
 * 設定キャッシュ
 */
let cachedConfig: CortexDebateConfig | undefined;

/**
 * 環境変数からboolean値をパース
 * @summary 環境変数パース
 * @param value 環境変数値
 * @param defaultValue デフォルト値
 * @returns パースされたboolean値
 */
function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1";
}

/**
 * 環境変数から数値をパース
 * @summary 環境変数パース
 * @param value 環境変数値
 * @param defaultValue デフォルト値
 * @param min 最小値
 * @param max 最大値
 * @returns パースされた数値
 */
function parseNumberEnv(
  value: string | undefined,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  if (min !== undefined && parsed < min) return defaultValue;
  if (max !== undefined && parsed > max) return defaultValue;
  return parsed;
}

/**
 * 環境変数から浮動小数点数をパース
 * @summary 環境変数パース
 * @param value 環境変数値
 * @param defaultValue デフォルト値
 * @param min 最小値
 * @param max 最大値
 * @returns パースされた浮動小数点数
 */
function parseFloatEnv(
  value: string | undefined,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return defaultValue;
  if (min !== undefined && parsed < min) return defaultValue;
  if (max !== undefined && parsed > max) return defaultValue;
  return parsed;
}

/**
 * CortexDebate設定を取得
 * 環境変数からのオーバーライドを適用した設定を返す
 * @summary 設定取得
 * @returns CortexDebate設定
 */
export function getCortexDebateConfig(): CortexDebateConfig {
  if (cachedConfig) return cachedConfig;

  const config: CortexDebateConfig = {
    ...DEFAULT_CONFIG,
    mdmConfig: { ...DEFAULT_CONFIG.mdmConfig },
    sparsityConfig: { ...DEFAULT_CONFIG.sparsityConfig },
    featureFlags: { ...DEFAULT_CONFIG.featureFlags },
  };

  // Main enable/disable
  if (parseBooleanEnv(process.env.PI_CORTEXDEBATE_ENABLED, false)) {
    config.enabled = true;
  }

  // Feature flags
  if (parseBooleanEnv(process.env.PI_CORTEXDEBATE_MDM, config.featureFlags.useMDM)) {
    config.featureFlags.useMDM = true;
  }

  if (parseBooleanEnv(process.env.PI_CORTEXDEBATE_SPARSE_GRAPH, config.featureFlags.useSparseGraph)) {
    config.featureFlags.useSparseGraph = true;
  }

  if (parseBooleanEnv(process.env.PI_CORTEXDEBATE_GRAPH_CONSENSUS, false)) {
    config.featureFlags.useGraphConsensus = true;
  }

  if (parseBooleanEnv(process.env.PI_CORTEXDEBATE_EARLY_TERMINATION, config.featureFlags.useEarlyTermination)) {
    config.featureFlags.useEarlyTermination = true;
  }

  // Numeric settings
  const maxRounds = parseNumberEnv(process.env.PI_CORTEXDEBATE_MAX_ROUNDS, config.maxRounds, 1, 20);
  if (maxRounds !== config.maxRounds) {
    config.maxRounds = maxRounds;
  }

  const convergenceThreshold = parseFloatEnv(
    process.env.PI_CORTEXDEBATE_CONVERGENCE_THRESHOLD,
    config.convergenceThreshold,
    0.0,
    1.0
  );
  if (convergenceThreshold !== config.convergenceThreshold) {
    config.convergenceThreshold = convergenceThreshold;
  }

  // Sparsity settings
  const targetDensity = parseFloatEnv(
    process.env.PI_CORTEXDEBATE_TARGET_DENSITY,
    config.sparsityConfig.targetDensity,
    0.1,
    1.0
  );
  if (targetDensity !== config.sparsityConfig.targetDensity) {
    config.sparsityConfig.targetDensity = targetDensity;
  }

  const maxDegree = parseNumberEnv(
    process.env.PI_CORTEXDEBATE_MAX_DEGREE,
    config.sparsityConfig.maxDegree,
    1,
    20
  );
  if (maxDegree !== config.sparsityConfig.maxDegree) {
    config.sparsityConfig.maxDegree = maxDegree;
  }

  const minEdgeWeight = parseFloatEnv(
    process.env.PI_CORTEXDEBATE_MIN_EDGE_WEIGHT,
    config.sparsityConfig.minEdgeWeight,
    0.0,
    1.0
  );
  if (minEdgeWeight !== config.sparsityConfig.minEdgeWeight) {
    config.sparsityConfig.minEdgeWeight = minEdgeWeight;
  }

  cachedConfig = config;
  return config;
}

/**
 * CortexDebateが有効かどうか
 * @summary 有効判定
 * @returns 有効な場合true
 */
export function isCortexDebateEnabled(): boolean {
  return getCortexDebateConfig().enabled;
}

/**
 * 特定のフィーチャーが有効かどうか
 * @summary フィーチャー有効判定
 * @param feature フィーチャー名
 * @returns 有効な場合true
 */
export function isFeatureEnabled(
  feature: keyof CortexDebateFeatureFlags
): boolean {
  const config = getCortexDebateConfig();
  if (!config.enabled) return false;
  return config.featureFlags[feature];
}

/**
 * 設定キャッシュをクリア
 * テスト環境での設定リセットに使用
 * @summary キャッシュクリア
 */
export function clearConfigCache(): void {
  cachedConfig = undefined;
}

/**
 * 設定を強制的に更新
 * テスト環境での設定注入に使用
 * @summary 設定強制更新
 * @param config 新しい設定
 */
export function setConfigForTesting(config: CortexDebateConfig): void {
  cachedConfig = config;
}
