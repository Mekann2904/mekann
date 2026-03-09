/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/cortexdebate-config.ts
 * role: CortexDebate設定管理モジュール
 * why: MDM変調器と連携するCortexDebate機能の設定を一元管理する
 * related:
 *   - .pi/extensions/agent-teams/mdm-modulator.ts (MDM変調器)
 *   - docs/research/cortexdebate.md (設計根拠)
 * public_api:
 *   - getCortexDebateConfig (関数)
 *   - clearConfigCache (関数)
 *   - setConfigForTesting (関数)
 *   - isCortexDebateEnabled (関数)
 *   - isFeatureEnabled (関数)
 */

import { MDMConfig } from "./mdm-modulator.js";

/**
 * @summary スパースグラフ設定
 */
export interface SparsityConfig {
  targetDensity: number;
  pruningStrategy: "threshold" | "topk" | "random";
  minEdgeWeight: number;
  maxDegree: number;
}

/**
 * @summary 機能フラグ
 */
export interface FeatureFlags {
  useMDM: boolean;
  useSparseGraph: boolean;
  useGraphConsensus: boolean;
  useEarlyTermination: boolean;
}

/**
 * @summary CortexDebate設定
 */
export interface CortexDebateConfig {
  enabled: boolean;
  mdmConfig: MDMConfig;
  sparsityConfig: SparsityConfig;
  maxRounds: number;
  convergenceThreshold: number;
  featureFlags: FeatureFlags;
}

// 設定キャッシュ
let configCache: CortexDebateConfig | null = null;

/**
 * @summary デフォルトMDM設定
 */
function getDefaultMDMConfig(): MDMConfig {
  return {
    dimensions: [
      { name: "confidence", weight: 0.4, source: "confidence" },
      { name: "evidence", weight: 0.3, source: "evidence" },
      { name: "stability", weight: 0.2, source: "custom" },
      { name: "consensus", weight: 0.1, source: "custom" },
    ],
    modulationFunction: "sigmoid",
    decayRate: 0.1,
    learningRate: 0.3,
    stabilityThreshold: 0.05,
  };
}

/**
 * @summary デフォルトスパースグラフ設定
 */
function getDefaultSparsityConfig(): SparsityConfig {
  return {
    targetDensity: 0.3,
    pruningStrategy: "threshold",
    minEdgeWeight: 0.1,
    maxDegree: 5,
  };
}

/**
 * @summary デフォルト機能フラグ
 */
function getDefaultFeatureFlags(): FeatureFlags {
  return {
    useMDM: true,
    useSparseGraph: true,
    useGraphConsensus: false,
    useEarlyTermination: true,
  };
}

/**
 * @summary 環境変数から設定を読み込み
 */
function loadConfigFromEnv(): Partial<CortexDebateConfig> {
  const config: Partial<CortexDebateConfig> = {};

  // CORTEX_DEBATE_ENABLED
  if (process.env.CORTEX_DEBATE_ENABLED !== undefined) {
    config.enabled = process.env.CORTEX_DEBATE_ENABLED === "true";
  }

  // MAX_ROUNDS
  if (process.env.CORTEX_MAX_ROUNDS) {
    config.maxRounds = parseInt(process.env.CORTEX_MAX_ROUNDS, 10);
  }

  // CONVERGENCE_THRESHOLD
  if (process.env.CORTEX_CONVERGENCE_THRESHOLD) {
    config.convergenceThreshold = parseFloat(process.env.CORTEX_CONVERGENCE_THRESHOLD);
  }

  return config;
}

/**
 * @summary CortexDebate設定を取得
 * @returns 設定オブジェクト
 */
export function getCortexDebateConfig(): CortexDebateConfig {
  if (configCache) {
    return configCache;
  }

  const envConfig = loadConfigFromEnv();
  
  configCache = {
    enabled: envConfig.enabled ?? true,
    mdmConfig: getDefaultMDMConfig(),
    sparsityConfig: getDefaultSparsityConfig(),
    maxRounds: envConfig.maxRounds ?? 10,
    convergenceThreshold: envConfig.convergenceThreshold ?? 0.85,
    featureFlags: getDefaultFeatureFlags(),
  };

  return configCache;
}

/**
 * @summary 設定キャッシュをクリア
 */
export function clearConfigCache(): void {
  configCache = null;
}

/**
 * @summary テスト用に設定を上書き
 * @param config - 上書きする設定
 */
export function setConfigForTesting(config: Partial<CortexDebateConfig>): void {
  const current = getCortexDebateConfig();
  configCache = {
    ...current,
    ...config,
    mdmConfig: config.mdmConfig ?? current.mdmConfig,
    sparsityConfig: config.sparsityConfig ?? current.sparsityConfig,
    featureFlags: config.featureFlags ?? current.featureFlags,
  };
}

/**
 * @summary CortexDebateが有効かどうか
 * @returns 有効ならtrue
 */
export function isCortexDebateEnabled(): boolean {
  const config = getCortexDebateConfig();
  return config.enabled;
}

/**
 * @summary 特定の機能が有効かどうか
 * @param feature - 機能名
 * @returns 有効ならtrue
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  const config = getCortexDebateConfig();
  
  // CortexDebateが無効ならすべての機能も無効
  if (!config.enabled) {
    return false;
  }
  
  return config.featureFlags[feature] ?? false;
}
