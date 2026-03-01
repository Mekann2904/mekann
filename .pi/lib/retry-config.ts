/**
 * @abdd.meta
 * path: .pi/lib/retry-config.ts
 * role: サブエージェント、エージェントチーム、およびLLMクライアント全体で統一されたリトライ設定を提供
 * why: 散在するリトライ設定を一元管理し、プロファイルベースのプリセットにより一貫したリトライ動作を実現するため
 * related: .pi/lib/agent/agent-common.ts, .pi/lib/retry-with-backoff.ts, .pi/extensions/subagents.ts
 * public_api: RetryProfile, RetryConfig, getRetryConfig, createRetryConfigFromEnv, PROVIDER_RETRY_DEFAULTS
 * invariants: maxDelayMs >= initialDelayMs, maxRetries >= 0, multiplier >= 1
 * side_effects: なし（環境変数の読み取りのみ）
 * failure_modes: 不正な環境変数値の場合はデフォルト値を使用
 * @abdd.explain
 * overview: LLM API呼び出し等におけるリトライ設定を一元管理するモジュール。stable/balanced/aggressiveの3つのプロファイルを提供し、環境変数による設定オーバーライドをサポートする。
 * what_it_does:
 *   - 3つのリトライプロファイル（stable/balanced/aggressive）の定義と提供
 *   - プロバイダー固有のリトライ設定オーバーライドのサポート
 *   - 環境変数PI_RETRY_PROFILE、PI_LLM_PROVIDERからの設定読み込み
 *   - 既存の散在するリトライ設定との互換性維持
 * why_it_exists:
 *   - agent-common.ts、retry-with-backoff.ts等で重複していたリトライ設定を統一するため
 *   - 本番環境、開発環境、バッチ処理等のユースケースに応じた設定切り替えを容易にするため
 *   - プロバイダーごとの特性に応じたリトライ戦略の適用を可能にするため
 * scope:
 *   in: 環境変数（PI_RETRY_PROFILE, PI_LLM_PROVIDER）
 *   out: RetryConfigオブジェクト、プロファイル選択関数
 */

/**
 * Centralized retry configuration.
 * Provides unified retry settings for subagents, agent-teams, and LLM clients.
 * Eliminates scattered retry configuration across multiple files.
 *
 * Feature: Phase 1 - Quick Wins (Retry Policy Unification)
 */

/**
 * Retry profile type for preset selection.
 * - stable: No retries, deterministic behavior for CI/CD and tests
 * - balanced: Moderate retries, suitable for production
 * - aggressive: High retries with longer delays, suitable for batch jobs
 * @summary リトライプロファイル
 */
export type RetryProfile = "stable" | "balanced" | "aggressive";

/**
 * Retry configuration structure.
 * Matches RetryWithBackoffConfig from retry-with-backoff.ts for compatibility.
 * @summary リトライ設定
 * @param maxRetries 最大リトライ回数
 * @param initialDelayMs 初期遅延時間（ミリ秒）
 * @param maxDelayMs 最大遅延時間（ミリ秒）
 * @param multiplier バックオフ乗数
 * @param jitter ジッターモード
 * @param providerOverrides プロバイダー固有のオーバーライド設定
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: "full" | "partial" | "none";
  /** Provider-specific retry overrides */
  providerOverrides?: Partial<Record<string, Partial<RetryConfig>>>;
}

/**
 * Predefined retry profiles.
 * Each profile is optimized for a specific use case.
 * @summary リトライプロファイル定義
 */
export const RETRY_PROFILES: Record<RetryProfile, RetryConfig> = {
  /**
   * Stable profile: No retries, deterministic behavior.
   * Use for: CI/CD pipelines, automated tests, production reliability
   */
  stable: {
    maxRetries: 0,
    initialDelayMs: 800,
    maxDelayMs: 30_000,
    multiplier: 2.0,
    jitter: "none",
  },

  /**
   * Balanced profile: Moderate retries with reasonable delays.
   * Use for: Production workloads, interactive sessions
   */
  balanced: {
    maxRetries: 3,
    initialDelayMs: 800,
    maxDelayMs: 60_000,
    multiplier: 2.0,
    jitter: "partial",
    providerOverrides: {
      openai: {
        maxRetries: 2,
        maxDelayMs: 45_000,
      },
      anthropic: {
        maxRetries: 3,
        maxDelayMs: 60_000,
      },
      google: {
        maxRetries: 2,
        initialDelayMs: 1000,
      },
    },
  },

  /**
   * Aggressive profile: High retries with extended delays.
   * Use for: Batch jobs, background processing, non-time-sensitive tasks
   */
  aggressive: {
    maxRetries: 5,
    initialDelayMs: 400,
    maxDelayMs: 120_000,
    multiplier: 1.5,
    jitter: "full",
    providerOverrides: {
      openai: {
        maxRetries: 4,
      },
      anthropic: {
        maxRetries: 5,
      },
    },
  },
};

/**
 * Default provider retry settings.
 * Used when no profile-specific override exists.
 * @summary プロバイダーデフォルト設定
 */
export const PROVIDER_RETRY_DEFAULTS: Partial<Record<string, Partial<RetryConfig>>> = {
  openai: {
    maxRetries: 2,
    initialDelayMs: 800,
  },
  anthropic: {
    maxRetries: 3,
    initialDelayMs: 800,
  },
  google: {
    maxRetries: 2,
    initialDelayMs: 1000,
  },
  azure: {
    maxRetries: 2,
    initialDelayMs: 800,
  },
  local: {
    maxRetries: 1,
    initialDelayMs: 500,
  },
};

/**
 * Get retry configuration for specified profile and provider.
 * Applies provider-specific overrides if available.
 * @summary リトライ設定取得
 * @param profile - Retry profile name (default: "balanced")
 * @param providerKey - Provider identifier for provider-specific overrides
 * @returns Merged retry configuration
 */
export function getRetryConfig(
  profile: RetryProfile = "balanced",
  providerKey?: string
): RetryConfig {
  const base = { ...RETRY_PROFILES[profile] };

  // Apply provider-specific overrides from profile
  if (providerKey && base.providerOverrides?.[providerKey]) {
    Object.assign(base, base.providerOverrides[providerKey]);
  }

  // Apply default provider settings if not overridden by profile
  if (providerKey && PROVIDER_RETRY_DEFAULTS[providerKey]) {
    const defaults = PROVIDER_RETRY_DEFAULTS[providerKey];
    for (const key of Object.keys(defaults) as Array<keyof RetryConfig>) {
      if (base[key] === RETRY_PROFILES[profile][key]) {
        // Only apply default if value hasn't been changed by profile override
        (base as Record<string, unknown>)[key] = defaults[key];
      }
    }
  }

  // Ensure maxDelayMs >= initialDelayMs
  if (base.maxDelayMs < base.initialDelayMs) {
    base.maxDelayMs = base.initialDelayMs;
  }

  return base;
}

/**
 * Create retry configuration from environment variables.
 * Reads PI_RETRY_PROFILE and PI_LLM_PROVIDER to determine settings.
 * @summary 環境変数から設定作成
 * @returns Environment-driven retry configuration
 */
export function createRetryConfigFromEnv(): RetryConfig {
  const profileEnv = process.env.PI_RETRY_PROFILE?.toLowerCase();
  let profile: RetryProfile;

  // Validate and map environment value to profile
  if (profileEnv === "stable" || profileEnv === "balanced" || profileEnv === "aggressive") {
    profile = profileEnv;
  } else {
    // Default to balanced for production stability
    profile = "balanced";
  }

  const providerKey = process.env.PI_LLM_PROVIDER?.toLowerCase();

  return getRetryConfig(profile, providerKey);
}

/**
 * Get the current retry profile from environment or default.
 * @summary 現在のリトライプロファイル取得
 * @returns Active retry profile name
 */
export function getActiveRetryProfile(): RetryProfile {
  const profileEnv = process.env.PI_RETRY_PROFILE?.toLowerCase();

  if (profileEnv === "stable" || profileEnv === "aggressive") {
    return profileEnv;
  }

  return "balanced";
}

/**
 * Check if stable profile is active.
 * Useful for conditional behavior in production vs development.
 * @summary 安定プロファイル判定
 * @returns True if stable profile is active
 */
export function isStableRetryProfile(): boolean {
  return getActiveRetryProfile() === "stable";
}

/**
 * Validate retry configuration.
 * Returns true if configuration values are within acceptable bounds.
 * @summary リトライ設定検証
 * @param config - Configuration to validate
 * @returns True if valid, false otherwise
 */
export function isValidRetryConfig(config: RetryConfig): boolean {
  return (
    config.maxRetries >= 0 &&
    config.maxRetries <= 20 &&
    config.initialDelayMs >= 1 &&
    config.initialDelayMs <= 600_000 &&
    config.maxDelayMs >= config.initialDelayMs &&
    config.maxDelayMs <= 600_000 &&
    config.multiplier >= 1 &&
    config.multiplier <= 10 &&
    ["full", "partial", "none"].includes(config.jitter)
  );
}

/**
 * Merge retry overrides into base configuration.
 * Useful for per-call customization while maintaining profile defaults.
 * @summary リトライ設定マージ
 * @param base - Base configuration
 * @param overrides - Override values
 * @returns Merged configuration
 */
export function mergeRetryConfig(
  base: RetryConfig,
  overrides?: Partial<RetryConfig>
): RetryConfig {
  if (!overrides) return { ...base };

  const merged: RetryConfig = {
    ...base,
    ...overrides,
  };

  // Ensure maxDelayMs >= initialDelayMs after merge
  if (merged.maxDelayMs < merged.initialDelayMs) {
    merged.maxDelayMs = merged.initialDelayMs;
  }

  return merged;
}
