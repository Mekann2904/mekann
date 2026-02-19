/**
 * @abdd.meta
 * path: .pi/lib/provider-limits.ts
 * role: 各プロバイダーおよびモデルのAPIレート制限と同時実行数を定義・管理する静的設定モジュール
 * why: 公式ドキュメントに基づいた制限値を集中管理し、API実行時のリミット超過エラーを防止するため
 * related: .pi/lib/provider.ts, .pi/lib/api-client.ts
 * public_api: ModelLimits, ModelTierLimits, ProviderLimitsConfig, ResolvedModelLimits, 定数RUNTIME_DIR, USER_LIMITS_FILE
 * invariants: rpmとconcurrencyは正の整数、tpmは未定義または正の整数
 * side_effects: ファイルシステムへの読み書き（readFileSync, writeFileSync）
 * failure_modes: 設定ファイルのフォーマット不正、JSONパースエラー、ファイルシステムアクセス権限エラー
 * @abdd.explain
 * overview: 公式ドキュメントおよびコミュニティの知見に基づき、プロバイダーごとのレート制限（RPM, TPM）と並行数制限を定義したレジストリ。
 * what_it_does:
 *   - ModelLimits, ModelTierLimits, ProviderLimitsConfigなどの制限設定を表すインターフェースを定義する
 *   - 組み込みの制限設定を静的データとして保持する
 *   - ユーザー設定ファイルの保存パス（~/.pi/runtime/provider-limits.json）を定義する
 *   - 設定ファイルの読み込み・書き込み・ディレクトリ作成を行うユーティリティ機能を提供する
 * why_it_exists:
 *   - 複数のAIプロバイダー（Anthropic, OpenAI, Googleなど）の異なる制限仕様を一元管理する
 *   - API呼び出しにおいて、プロバイダー側の制限を超過してリクエスト拒否やエラーが発生するのを防ぐ
 * scope:
 *   in: 定義された制限値、読み込まれたJSON設定ファイル
 *   out: 制限値の解決結果（ResolvedModelLimits）、ファイルシステムへの設定書き込み
 */

/**
 * Provider Limits Registry
 *
 * Defines rate limits and concurrency limits for each provider/model.
 * Based on official documentation and community knowledge.
 *
 * @see https://docs.anthropic.com/en/api/rate-limits
 * @see https://platform.openai.com/docs/guides/rate-limits
 * @see https://ai.google.dev/gemini-api/docs/rate-limits
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * @summary モデル制限詳細
 * モデルの具体的な制限値を定義します。
 * @param rpm リクエストレート制限。
 * @param tpm トークンレート制限。
 * @param concurrency 最大同時実行数。
 * @param description 説明文。
 */
export interface ModelLimits {
  /** Requests per minute */
  rpm: number;
  /** Tokens per minute (optional) */
  tpm?: number;
  /** Max concurrent requests */
  concurrency: number;
  /** Description for debugging */
  description?: string;
}

/**
 * @summary 階層制限定義
 * モデルの各階層ごとの制限値を定義します。
 * @param tiers 階層ごとの制限設定マップ。
 * @param default デフォルトの制限設定。
 */
export interface ModelTierLimits {
  tiers: {
    [tier: string]: ModelLimits;
  };
  /** Fallback if tier is unknown */
  default?: ModelLimits;
}

/**
 * 制限設定形式
 * @summary 制限設定形式
 */
export interface ProviderLimitsConfig {
  version: number;
  lastUpdated: string;
  source: string;
  providers: {
    [provider: string]: {
      displayName: string;
      documentation?: string;
      models: {
        [pattern: string]: ModelTierLimits;
      };
    };
  };
}

/**
 * モデル制限定義
 * @summary モデル制限定義
 */
export interface ResolvedModelLimits {
  provider: string;
  model: string;
  tier: string;
  rpm: number;
  tpm: number | undefined;
  concurrency: number;
  source: "preset" | "fallback" | "default";
}

// ============================================================================
// Constants
// ============================================================================

const RUNTIME_DIR = join(homedir(), ".pi", "runtime");
const USER_LIMITS_FILE = join(RUNTIME_DIR, "provider-limits.json");

/**
 * Built-in provider limits based on official documentation.
 * These are conservative estimates; actual limits may vary by account.
 */
const BUILTIN_LIMITS: ProviderLimitsConfig = {
  version: 1,
  lastUpdated: "2026-02-15",
  source: "builtin",
  providers: {
    anthropic: {
      displayName: "Anthropic",
      documentation: "https://docs.anthropic.com/en/api/rate-limits",
      models: {
        // Claude 4.x series
        "claude-sonnet-4-*": {
          tiers: {
            pro: { rpm: 1000, tpm: 80000, concurrency: 5, description: "Claude Pro subscription" },
            max: { rpm: 4000, tpm: 400000, concurrency: 8, description: "Claude Max subscription" },
          },
          default: { rpm: 500, tpm: 40000, concurrency: 3, description: "Unknown tier, conservative" },
        },
        "claude-opus-4-*": {
          tiers: {
            pro: { rpm: 500, tpm: 80000, concurrency: 3, description: "Claude Pro subscription" },
            max: { rpm: 2000, tpm: 400000, concurrency: 5, description: "Claude Max subscription" },
          },
          default: { rpm: 250, tpm: 40000, concurrency: 2, description: "Unknown tier, conservative" },
        },
        // Claude 3.5 series
        "claude-3-5-sonnet-*": {
          tiers: {
            pro: { rpm: 1000, tpm: 80000, concurrency: 5 },
            max: { rpm: 4000, tpm: 400000, concurrency: 8 },
          },
          default: { rpm: 500, tpm: 40000, concurrency: 3 },
        },
        "claude-3-5-haiku-*": {
          tiers: {
            pro: { rpm: 2000, tpm: 160000, concurrency: 6 },
            max: { rpm: 8000, tpm: 800000, concurrency: 10 },
          },
          default: { rpm: 1000, tpm: 80000, concurrency: 4 },
        },
        // Claude 3 series (legacy)
        "claude-3-opus-*": {
          tiers: {
            pro: { rpm: 500, tpm: 80000, concurrency: 3 },
            max: { rpm: 2000, tpm: 400000, concurrency: 5 },
          },
          default: { rpm: 250, tpm: 40000, concurrency: 2 },
        },
        "claude-3-sonnet-*": {
          tiers: {
            pro: { rpm: 1000, tpm: 80000, concurrency: 5 },
          },
          default: { rpm: 500, tpm: 40000, concurrency: 3 },
        },
        "claude-3-haiku-*": {
          tiers: {
            pro: { rpm: 2000, tpm: 160000, concurrency: 6 },
          },
          default: { rpm: 1000, tpm: 80000, concurrency: 4 },
        },
      },
    },
    openai: {
      displayName: "OpenAI",
      documentation: "https://platform.openai.com/docs/guides/rate-limits",
      models: {
        "gpt-4o": {
          tiers: {
            free: { rpm: 10, tpm: 10000, concurrency: 1, description: "Free tier" },
            plus: { rpm: 80, tpm: 40000, concurrency: 2, description: "ChatGPT Plus" },
            pro: { rpm: 500, tpm: 200000, concurrency: 4, description: "ChatGPT Pro" },
            api_tier1: { rpm: 500, tpm: 30000, concurrency: 3, description: "API Tier 1" },
            api_tier2: { rpm: 5000, tpm: 450000, concurrency: 6, description: "API Tier 2" },
          },
          default: { rpm: 80, tpm: 40000, concurrency: 2 },
        },
        "gpt-4o-mini": {
          tiers: {
            free: { rpm: 20, tpm: 20000, concurrency: 2 },
            plus: { rpm: 200, tpm: 100000, concurrency: 4 },
            pro: { rpm: 1000, tpm: 400000, concurrency: 6 },
          },
          default: { rpm: 200, tpm: 100000, concurrency: 4 },
        },
        "gpt-4-turbo": {
          tiers: {
            plus: { rpm: 80, tpm: 40000, concurrency: 2 },
            pro: { rpm: 500, tpm: 200000, concurrency: 4 },
          },
          default: { rpm: 80, tpm: 40000, concurrency: 2 },
        },
        "gpt-4": {
          tiers: {
            plus: { rpm: 40, tpm: 20000, concurrency: 1 },
            pro: { rpm: 200, tpm: 100000, concurrency: 3 },
          },
          default: { rpm: 40, tpm: 20000, concurrency: 1 },
        },
        "o1": {
          tiers: {
            pro: { rpm: 100, tpm: 100000, concurrency: 2 },
          },
          default: { rpm: 50, tpm: 50000, concurrency: 1 },
        },
        "o1-preview": {
          tiers: {
            pro: { rpm: 50, tpm: 50000, concurrency: 1 },
          },
          default: { rpm: 30, tpm: 30000, concurrency: 1 },
        },
        "o1-mini": {
          tiers: {
            pro: { rpm: 100, tpm: 100000, concurrency: 2 },
          },
          default: { rpm: 50, tpm: 50000, concurrency: 1 },
        },
      },
    },
    google: {
      displayName: "Google (Gemini)",
      documentation: "https://ai.google.dev/gemini-api/docs/rate-limits",
      models: {
        "gemini-2.5-pro*": {
          tiers: {
            free: { rpm: 15, tpm: 1000000, concurrency: 1, description: "Free tier (very limited)" },
            pro: { rpm: 2000, tpm: 4000000, concurrency: 8, description: "Google AI Pro" },
          },
          default: { rpm: 15, tpm: 1000000, concurrency: 1 },
        },
        "gemini-2.0-flash*": {
          tiers: {
            free: { rpm: 30, tpm: 2000000, concurrency: 2 },
            pro: { rpm: 4000, tpm: 8000000, concurrency: 10 },
          },
          default: { rpm: 30, tpm: 2000000, concurrency: 2 },
        },
        "gemini-1.5-pro*": {
          tiers: {
            free: { rpm: 15, tpm: 1000000, concurrency: 1 },
            pro: { rpm: 2000, tpm: 4000000, concurrency: 8 },
          },
          default: { rpm: 15, tpm: 1000000, concurrency: 1 },
        },
        "gemini-1.5-flash*": {
          tiers: {
            free: { rpm: 30, tpm: 2000000, concurrency: 2 },
            pro: { rpm: 4000, tpm: 8000000, concurrency: 10 },
          },
          default: { rpm: 30, tpm: 2000000, concurrency: 2 },
        },
      },
    },
    mistral: {
      displayName: "Mistral",
      documentation: "https://docs.mistral.ai/platform/rate-limits/",
      models: {
        "mistral-large*": {
          tiers: {
            free: { rpm: 10, concurrency: 1 },
            pro: { rpm: 500, concurrency: 5 },
          },
          default: { rpm: 10, concurrency: 1 },
        },
        "mistral-medium*": {
          tiers: {
            free: { rpm: 20, concurrency: 2 },
            pro: { rpm: 1000, concurrency: 6 },
          },
          default: { rpm: 20, concurrency: 2 },
        },
        "codestral*": {
          tiers: {
            free: { rpm: 30, concurrency: 2 },
            pro: { rpm: 1000, concurrency: 6 },
          },
          default: { rpm: 30, concurrency: 2 },
        },
      },
    },
    groq: {
      displayName: "Groq",
      documentation: "https://console.groq.com/docs/rate-limits",
      models: {
        "llama-*": {
          tiers: {
            free: { rpm: 30, tpm: 6000, concurrency: 2 },
          },
          default: { rpm: 30, tpm: 6000, concurrency: 2 },
        },
        "mixtral-*": {
          tiers: {
            free: { rpm: 30, tpm: 6000, concurrency: 2 },
          },
          default: { rpm: 30, tpm: 6000, concurrency: 2 },
        },
      },
    },
    cerebras: {
      displayName: "Cerebras",
      documentation: "https://inference-docs.cerebras.ai/api/rate-limits",
      models: {
        "*": {
          tiers: {
            free: { rpm: 30, concurrency: 2 },
          },
          default: { rpm: 30, concurrency: 2 },
        },
      },
    },
    xai: {
      displayName: "xAI (Grok)",
      documentation: "https://docs.x.ai/docs/rate-limits",
      models: {
        "grok-*": {
          tiers: {
            pro: { rpm: 100, concurrency: 3 },
          },
          default: { rpm: 50, concurrency: 2 },
        },
      },
    },
  },
};

// Default fallback for unknown providers
const DEFAULT_LIMITS: ModelLimits = {
  rpm: 30,
  concurrency: 2,
  description: "Unknown provider, conservative default",
};

// ============================================================================
// State
// ============================================================================

let cachedLimits: ProviderLimitsConfig | null = null;

// ============================================================================
// Utilities
// ============================================================================

function matchesPattern(model: string, pattern: string): boolean {
  // Convert glob pattern to regex with proper escaping
  // First escape all regex special characters
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Then convert glob wildcards to regex
  const regexPattern = escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".");
  const regex = new RegExp("^" + regexPattern + "$", "i");
  return regex.test(model);
}

function loadUserLimits(): ProviderLimitsConfig | null {
  try {
    if (existsSync(USER_LIMITS_FILE)) {
      const content = readFileSync(USER_LIMITS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && parsed.version) {
        return parsed as ProviderLimitsConfig;
      }
    }
  } catch (error) {
    // ignore
  }
  return null;
}

function mergeLimits(
  builtin: ProviderLimitsConfig,
  user: ProviderLimitsConfig | null
): ProviderLimitsConfig {
  if (!user) return builtin;

  // Deep merge: user limits override builtin
  const merged: ProviderLimitsConfig = {
    version: Math.max(builtin.version, user.version),
    lastUpdated: user.lastUpdated || builtin.lastUpdated,
    source: "merged",
    providers: { ...builtin.providers },
  };

  for (const [provider, config] of Object.entries(user.providers)) {
    if (!merged.providers[provider]) {
      merged.providers[provider] = config;
    } else {
      merged.providers[provider] = {
        ...merged.providers[provider],
        ...config,
        models: {
          ...merged.providers[provider].models,
          ...config.models,
        },
      };
    }
  }

  return merged;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * @summary 設定取得
 * プロバイダーの制限設定を取得します。
 * @returns プロバイダー制限設定オブジェクト。
 */
export function getLimitsConfig(): ProviderLimitsConfig {
  if (cachedLimits) return cachedLimits;

  const userLimits = loadUserLimits();
  cachedLimits = mergeLimits(BUILTIN_LIMITS, userLimits);
  return cachedLimits;
}

/**
 * 制限設定を再読み込み
 * @summary 制限設定を再読み込み
 * @returns {void}
 */
export function reloadLimits(): void {
  cachedLimits = null;
  getLimitsConfig();
}

 /**
  * 指定したプロバイダ/モデル/ティアの制限を解決する
  * @param provider プロバイダ名
  * @param model モデル名
  * @param tier ティア（任意）
  * @returns 解決されたモデル制限
  */
export function resolveLimits(
  provider: string,
  model: string,
  tier?: string
): ResolvedModelLimits {
  const config = getLimitsConfig();
  const normalizedProvider = provider.toLowerCase();
  const normalizedModel = model.toLowerCase();

  const providerConfig = Object.prototype.hasOwnProperty.call(
    config.providers,
    normalizedProvider
  )
    ? config.providers[normalizedProvider]
    : undefined;

  // Provider not found
  if (!providerConfig) {
    return {
      provider: normalizedProvider,
      model: normalizedModel,
      tier: tier || "unknown",
      rpm: DEFAULT_LIMITS.rpm,
      tpm: DEFAULT_LIMITS.tpm,
      concurrency: DEFAULT_LIMITS.concurrency,
      source: "default",
    };
  }

  // Find matching model pattern
  for (const [pattern, limits] of Object.entries(providerConfig.models)) {
    if (matchesPattern(normalizedModel, pattern)) {
      // Check if tier is specified
      if (tier && limits.tiers[tier]) {
        const tierLimits = limits.tiers[tier];
        return {
          provider: normalizedProvider,
          model: normalizedModel,
          tier,
          rpm: tierLimits.rpm,
          tpm: tierLimits.tpm,
          concurrency: tierLimits.concurrency,
          source: "preset",
        };
      }

      // Try common tiers
      const commonTiers = ["pro", "plus", "free", "default"];
      for (const commonTier of commonTiers) {
        if (limits.tiers[commonTier]) {
          const tierLimits = limits.tiers[commonTier];
          return {
            provider: normalizedProvider,
            model: normalizedModel,
            tier: commonTier,
            rpm: tierLimits.rpm,
            tpm: tierLimits.tpm,
            concurrency: tierLimits.concurrency,
            source: "preset",
          };
        }
      }

      // Use default if available
      if (limits.default) {
        return {
          provider: normalizedProvider,
          model: normalizedModel,
          tier: "default",
          rpm: limits.default.rpm,
          tpm: limits.default.tpm,
          concurrency: limits.default.concurrency,
          source: "fallback",
        };
      }

      // First tier as last resort
      const firstTier = Object.entries(limits.tiers)[0];
      if (firstTier) {
        return {
          provider: normalizedProvider,
          model: normalizedModel,
          tier: firstTier[0],
          rpm: firstTier[1].rpm,
          tpm: firstTier[1].tpm,
          concurrency: firstTier[1].concurrency,
          source: "fallback",
        };
      }
    }
  }

  // Model not found, use provider default or global default
  return {
    provider: normalizedProvider,
    model: normalizedModel,
    tier: tier || "unknown",
    rpm: DEFAULT_LIMITS.rpm,
    tpm: DEFAULT_LIMITS.tpm,
    concurrency: DEFAULT_LIMITS.concurrency,
    source: "default",
  };
}

 /**
  * プロバイダーとモデルの並列処理数上限を取得
  * @param provider プロバイダー名
  * @param model モデル名
  * @param tier 層（オプション）
  * @returns 並列処理数の上限
  */
export function getConcurrencyLimit(provider: string, model: string, tier?: string): number {
  return resolveLimits(provider, model, tier).concurrency;
}

 /**
  * プロバイダー/モデルのRPM制限を取得
  * @param provider プロバイダー名
  * @param model モデル名
  * @param tier サブスクリプション階層（任意）
  * @returns RPM制限値
  */
export function getRpmLimit(provider: string, model: string, tier?: string): number {
  return resolveLimits(provider, model, tier).rpm;
}

/**
 * @summary プロバイダー一覧取得
 * 既知のすべてのプロバイダー一覧を取得
 * @returns プロバイダー名の配列
 */
export function listProviders(): string[] {
  const config = getLimitsConfig();
  return Object.keys(config.providers);
}

/**
 * 利用可能モデル一覧取得
 * @summary モデル一覧取得
 * @param provider プロバイダ名
 * @returns モデル名配列
 */
export function listModels(provider: string): string[] {
  const config = getLimitsConfig();
  const providerConfig = config.providers[provider.toLowerCase()];
  if (!providerConfig) return [];
  return Object.keys(providerConfig.models);
}

/**
 * ユーザー制限設定保存
 * @summary 設定保存
 * @param limits プロバイダ制限設定
 */
export function saveUserLimits(limits: ProviderLimitsConfig): void {
  if (!existsSync(RUNTIME_DIR)) {
    mkdirSync(RUNTIME_DIR, { recursive: true });
  }
  limits.source = "user";
  limits.lastUpdated = new Date().toISOString();
  writeFileSync(USER_LIMITS_FILE, JSON.stringify(limits, null, 2));
  cachedLimits = null; // Invalidate cache
}

/**
 * 組み込み制限設定取得
 * @summary 組み込み設定取得
 * @returns プロバイダ制限設定
 */
export function getBuiltinLimits(): ProviderLimitsConfig {
  return JSON.parse(JSON.stringify(BUILTIN_LIMITS));
}

/**
 * プロバイダティア検出
 * @summary ティア特定
 * @param provider プロバイダ名
 * @param _model モデル名
 * @returns ティア名
 */
export function detectTier(provider: string, _model: string): string | undefined {
  const envTier = process.env.PI_PROVIDER_TIER;
  if (envTier) return envTier;

  // Provider-specific env vars
  const envKey = `PI_${provider.toUpperCase()}_TIER`;
  const providerTier = process.env[envKey];
  if (providerTier) return providerTier;

  return undefined;
}

/**
 * 制限サマリを生成
 * @summary サマリ生成
 * @param limits 解決済みモデル制限
 * @returns サマリ文字列
 */
export function formatLimitsSummary(limits: ResolvedModelLimits): string {
  const parts = [
    `${limits.provider}/${limits.model}`,
    `tier: ${limits.tier}`,
    `rpm: ${limits.rpm}`,
    `concurrency: ${limits.concurrency}`,
  ];
  if (limits.tpm) {
    parts.push(`tpm: ${limits.tpm}`);
  }
  parts.push(`(${limits.source})`);
  return parts.join(", ");
}
