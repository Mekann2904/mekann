/**
 * @abdd.meta
 * path: .pi/lib/verification/config.ts
 * role: 検証ワークフローの設定管理モジュール
 * why: 環境変数やモードに応じた検証設定の動的解決を一元管理するため
 * related: ./types.ts, ../verification-workflow.ts
 * public_api: resolveVerificationConfig, resolveVerificationConfigV2, getVerificationModeFromEnv, REPOAUD_VERIFICATION_CONFIG, HIGH_STAKES_ONLY_VERIFICATION_CONFIG, EXPLICIT_ONLY_VERIFICATION_CONFIG
 * invariants: 戻り値は常に有効なVerificationWorkflowConfig/V2オブジェクト
 * side_effects: なし（純粋関数）
 * failure_modes: 環境変数の不正値はデフォルト値でフォールバック
 * @abdd.explain
 * overview: 検証ワークフローの設定解決と管理を行う
 * what_it_does:
 *   - 環境変数から検証モードを取得する
 *   - モードに応じた設定オブジェクトを返す
 *   - カスタム設定とデフォルト設定をマージする
 * why_it_exists:
 *   - 設定ロジックを一元管理し、設定変更の影響範囲を限定する
 *   - 環境ごとの設定切り替えを容易にする
 * scope:
 *   in: types.ts
 *   out: core.ts, index.ts
 */

import {
  type VerificationWorkflowConfig,
  type VerificationWorkflowConfigV2,
  type VerificationMode,
  DEFAULT_VERIFICATION_CONFIG,
} from "./types.js";

// ============================================================================
// Predefined Configurations
// ============================================================================

/**
 * リポジトリ監査用の検証設定
 */
export const REPOAUD_VERIFICATION_CONFIG: VerificationWorkflowConfigV2 = {
  mode: "repo-audit",
  enabled: true,
  triggerModes: ["post-subagent", "high-stakes"],
  challengerConfig: {
    minConfidenceToChallenge: 0.75,
    requiredFlaws: 1,
    enabledCategories: ["evidence-gap", "logical-flaw", "assumption", "alternative"],
  },
  inspectorConfig: {
    suspicionThreshold: "medium",
    requiredPatterns: [
      "claim-result-mismatch",
      "missing-alternatives",
      "confirmation-bias",
      "overconfidence",
    ],
    autoTriggerOnCollapseSignals: true,
  },
  fallbackBehavior: "warn",
  maxVerificationDepth: 2,
  minConfidenceToSkipVerification: 0.95,
};

/**
 * 高リスクタスクのみ検証する設定
 */
export const HIGH_STAKES_ONLY_VERIFICATION_CONFIG: VerificationWorkflowConfigV2 = {
  mode: "high-stakes-only",
  enabled: true,
  triggerModes: ["high-stakes"],
  challengerConfig: {
    minConfidenceToChallenge: 0.7,
    requiredFlaws: 1,
    enabledCategories: ["evidence-gap", "logical-flaw", "boundary"],
  },
  inspectorConfig: {
    suspicionThreshold: "high",
    requiredPatterns: ["claim-result-mismatch", "overconfidence"],
    autoTriggerOnCollapseSignals: true,
  },
  fallbackBehavior: "block",
  maxVerificationDepth: 3,
  minConfidenceToSkipVerification: 0.98,
};

/**
 * 明示的要求のみ検証する設定
 */
export const EXPLICIT_ONLY_VERIFICATION_CONFIG: VerificationWorkflowConfigV2 = {
  mode: "explicit-only",
  enabled: true,
  triggerModes: ["explicit"],
  challengerConfig: {
    minConfidenceToChallenge: 0.8,
    requiredFlaws: 1,
    enabledCategories: ["evidence-gap", "logical-flaw", "assumption", "alternative", "boundary", "causal-reversal"],
  },
  inspectorConfig: {
    suspicionThreshold: "medium",
    requiredPatterns: [
      "claim-result-mismatch",
      "evidence-confidence-gap",
      "missing-alternatives",
      "causal-reversal",
      "confirmation-bias",
      "overconfidence",
    ],
    autoTriggerOnCollapseSignals: false,
  },
  fallbackBehavior: "warn",
  maxVerificationDepth: 2,
  minConfidenceToSkipVerification: 0.9,
};

// ============================================================================
// Configuration Resolvers
// ============================================================================

/**
 * 検証設定を解決する（V1）
 * @summary 設定解決
 * @returns 検証ワークフロー設定
 * @deprecated V2のresolveVerificationConfigV2を使用してください
 */
export function resolveVerificationConfig(): VerificationWorkflowConfig {
  const mode = getVerificationModeFromEnv();

  switch (mode) {
    case "repo-audit":
      return REPOAUD_VERIFICATION_CONFIG;
    case "high-stakes-only":
      return HIGH_STAKES_ONLY_VERIFICATION_CONFIG;
    case "explicit-only":
      return EXPLICIT_ONLY_VERIFICATION_CONFIG;
    case "disabled":
      return { ...DEFAULT_VERIFICATION_CONFIG, enabled: false };
    default:
      return DEFAULT_VERIFICATION_CONFIG;
  }
}

/**
 * 検証設定を解決する（V2）
 * @summary V2設定解決
 * @param customConfig カスタム設定（オプション）
 * @returns 検証ワークフロー設定V2
 */
export function resolveVerificationConfigV2(
  customConfig?: Partial<VerificationWorkflowConfigV2>
): VerificationWorkflowConfigV2 {
  const mode = customConfig?.mode ?? getVerificationModeFromEnv();

  let baseConfig: VerificationWorkflowConfigV2;

  switch (mode) {
    case "repo-audit":
      baseConfig = REPOAUD_VERIFICATION_CONFIG;
      break;
    case "high-stakes-only":
      baseConfig = HIGH_STAKES_ONLY_VERIFICATION_CONFIG;
      break;
    case "explicit-only":
      baseConfig = EXPLICIT_ONLY_VERIFICATION_CONFIG;
      break;
    case "disabled":
      baseConfig = {
        ...DEFAULT_VERIFICATION_CONFIG,
        mode: "disabled",
        enabled: false,
      };
      break;
    default:
      baseConfig = {
        ...DEFAULT_VERIFICATION_CONFIG,
        mode: "default",
      };
  }

  if (!customConfig) {
    return baseConfig;
  }

  // カスタム設定をマージ
  return {
    ...baseConfig,
    ...customConfig,
    challengerConfig: {
      ...baseConfig.challengerConfig,
      ...customConfig.challengerConfig,
    },
    inspectorConfig: {
      ...baseConfig.inspectorConfig,
      ...customConfig.inspectorConfig,
    },
  };
}

/**
 * 環境変数から検証モードを取得
 * @summary モード取得
 * @returns 検証モード
 */
export function getVerificationModeFromEnv(): VerificationMode {
  const mode = process.env.PI_VERIFICATION_MODE?.toLowerCase();

  switch (mode) {
    case "repo-audit":
      return "repo-audit";
    case "high-stakes-only":
      return "high-stakes-only";
    case "explicit-only":
      return "explicit-only";
    case "disabled":
      return "disabled";
    case "default":
      return "default";
    default:
      return "default";
  }
}
