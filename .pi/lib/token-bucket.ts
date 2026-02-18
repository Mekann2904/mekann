// File: .pi/lib/token-bucket.ts
// Description: Token bucket rate limiter with provider/model-specific limits.
// Why: Enables RPM-based rate limiting with burst tolerance for LLM API calls.
// Related: .pi/lib/task-scheduler.ts, .pi/lib/adaptive-rate-controller.ts

// ============================================================================
// Types
// ============================================================================

/**
 * Token bucket state for a provider/model combination.
 */
interface TokenBucketState {
  /** Available tokens */
  tokens: number;
  /** Maximum bucket capacity */
  maxTokens: number;
  /** Tokens replenished per second */
  refillRate: number;
  /** Last refill timestamp (ms) */
  lastRefillMs: number;
  /** Pending 429 retry-after timestamp (ms) */
  retryAfterMs: number;
  /** Burst multiplier (allows temporary exceed) */
  burstMultiplier: number;
  /** Current burst tokens used */
  burstTokensUsed: number;
}

 /**
  * レート制限の設定
  * @param rpm 1分あたりのリクエスト数
  * @param burstMultiplier バースト許容量（基本レートの倍率）
  * @param minIntervalMs リクエスト間の最小待機時間（ミリ秒）
  */
export interface RateLimitConfig {
  /** Requests per minute */
  rpm: number;
  /** Burst allowance (multiplier of base rate) */
  burstMultiplier: number;
  /** Minimum wait between requests (ms) */
  minIntervalMs: number;
}

 /**
  * レートリミッターの統計情報
  * @param trackedModels 追踪中のプロバイダ/モデル数
  * @param blockedModels 429で現在ブロックされているモデル
  * @param avgAvailableTokens 全モデルの平均利用可能トークン数
  * @param lowCapacityModels 低容量（<20%）のモデル
  */
export interface RateLimiterStats {
  /** Provider/model combinations being tracked */
  trackedModels: number;
  /** Models currently blocked by 429 */
  blockedModels: string[];
  /** Average available tokens across all models */
  avgAvailableTokens: number;
  /** Models at low capacity (<20%) */
  lowCapacityModels: string[];
}

 /**
  * トークンバケット方式のレート制限インターフェース
  */
export interface TokenBucketRateLimiter {
  /**
   * Check if we can proceed with a request.
   * @returns Wait time in ms, or 0 if can proceed immediately
   */
  canProceed(provider: string, model: string, tokensNeeded: number): number;

  /**
   * Consume tokens from the bucket.
   */
  consume(provider: string, model: string, tokens: number): void;

  /**
   * Record a 429 error and adjust rate limiting.
   */
  record429(provider: string, model: string, retryAfterMs?: number): void;

  /**
   * Record a successful request.
   */
  recordSuccess(provider: string, model: string): void;

  /**
   * Get current statistics.
   */
  getStats(): RateLimiterStats;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default rate limit configurations by provider tier.
 */
const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  // Anthropic defaults
  "anthropic:default": { rpm: 60, burstMultiplier: 2.0, minIntervalMs: 100 },
  "anthropic:claude-3-5-sonnet": { rpm: 60, burstMultiplier: 1.5, minIntervalMs: 100 },
  "anthropic:claude-3-5-haiku": { rpm: 100, burstMultiplier: 2.0, minIntervalMs: 50 },
  "anthropic:claude-sonnet-4": { rpm: 60, burstMultiplier: 1.5, minIntervalMs: 100 },
  "anthropic:claude-opus-4": { rpm: 30, burstMultiplier: 1.2, minIntervalMs: 200 },

  // OpenAI defaults
  "openai:default": { rpm: 500, burstMultiplier: 2.0, minIntervalMs: 50 },
  "openai:gpt-4o": { rpm: 500, burstMultiplier: 1.5, minIntervalMs: 50 },
  "openai:gpt-4-turbo": { rpm: 500, burstMultiplier: 1.5, minIntervalMs: 50 },
  "openai:gpt-3.5-turbo": { rpm: 3500, burstMultiplier: 2.0, minIntervalMs: 20 },

  // Google defaults
  "google:default": { rpm: 60, burstMultiplier: 2.0, minIntervalMs: 100 },
  "google:gemini-pro": { rpm: 60, burstMultiplier: 2.0, minIntervalMs: 100 },
  "google:gemini-1.5-pro": { rpm: 30, burstMultiplier: 1.5, minIntervalMs: 200 },

  // Generic default
  "default:default": { rpm: 60, burstMultiplier: 1.5, minIntervalMs: 100 },
};

const MIN_TOKENS = 1;
const MAX_TOKENS = 10000;
const DEFAULT_429_RETRY_MS = 60_000; // 1 minute default retry
const MAX_429_RETRY_MS = 10 * 60 * 1000; // 10 minutes max
const BURST_COOLDOWN_MS = 60_000; // 1 minute burst cooldown

// ============================================================================
// Token Bucket Implementation
// ============================================================================

/**
 * Token bucket rate limiter with RPM support and burst tolerance.
 */
class TokenBucketRateLimiterImpl implements TokenBucketRateLimiter {
  private readonly buckets: Map<string, TokenBucketState> = new Map();
  private readonly configs: Map<string, RateLimitConfig> = new Map();

  constructor() {
    // Initialize with default configs
    for (const [key, config] of Object.entries(DEFAULT_CONFIGS)) {
      this.configs.set(key, config);
    }
  }

   /**
    * リクエストが実行可能か確認する
    * @param provider プロバイダ名
    * @param model モデル名
    * @param tokensNeeded 必要なトークン数
    * @returns 待機時間（ミリ秒）、即時実行可能な場合は0
    */
  canProceed(provider: string, model: string, tokensNeeded: number): number {
    const key = this.getKey(provider, model);
    const state = this.getOrCreateState(key, provider, model);

    // Check if blocked by 429
    const now = Date.now();
    if (state.retryAfterMs > now) {
      return state.retryAfterMs - now;
    }

    // Refill tokens
    this.refillTokens(state);

    // Check minimum interval
    const timeSinceLastRefill = now - state.lastRefillMs;
    const config = this.getConfig(provider, model);
    if (timeSinceLastRefill < config.minIntervalMs) {
      return config.minIntervalMs - timeSinceLastRefill;
    }

    // Check if enough tokens available
    const availableWithBurst = state.tokens + (state.maxTokens * state.burstMultiplier - state.burstTokensUsed);
    if (availableWithBurst >= tokensNeeded) {
      return 0; // Can proceed
    }

    // Calculate wait time for token refill
    const tokensNeededMore = tokensNeeded - state.tokens;
    const waitMs = Math.ceil((tokensNeededMore / state.refillRate) * 1000);
    return Math.max(1, waitMs);
  }

   /**
    * バケットからトークンを消費する
    * @param provider プロバイダ名
    * @param model モデル名
    * @param tokens 消費するトークン数
    * @returns なし
    */
  consume(provider: string, model: string, tokens: number): void {
    const key = this.getKey(provider, model);
    const state = this.getOrCreateState(key, provider, model);

    // Refill first
    this.refillTokens(state);

    // Consume from main bucket
    if (state.tokens >= tokens) {
      state.tokens -= tokens;
    } else {
      // Use burst capacity
      const remaining = tokens - state.tokens;
      state.tokens = 0;
      state.burstTokensUsed += remaining;
    }

    // Clamp values
    state.tokens = Math.max(0, state.tokens);
    state.burstTokensUsed = Math.min(state.maxTokens * state.burstMultiplier, state.burstTokensUsed);
  }

   /**
    * 429エラーを記録し、レート制限を調整します。
    * @param provider プロバイダ名
    * @param model モデル名
    * @param retryAfterMs リトライまでの待機時間（ミリ秒）
    */
  record429(provider: string, model: string, retryAfterMs?: number): void {
    const key = this.getKey(provider, model);
    const state = this.getOrCreateState(key, provider, model);
    const now = Date.now();

    // Set retry-after time
    const retryMs = Math.min(
      retryAfterMs ?? DEFAULT_429_RETRY_MS,
      MAX_429_RETRY_MS
    );
    state.retryAfterMs = now + retryMs;

    // Reduce burst capacity temporarily
    state.burstMultiplier = Math.max(1.0, state.burstMultiplier * 0.8);

    // Drain some tokens as penalty
    state.tokens = Math.max(0, state.tokens - 5);

    // Reduce refill rate slightly
    state.refillRate = Math.max(0.5, state.refillRate * 0.9);
  }

   /**
    * 成功したリクエストを記録する。
    * @param provider プロバイダ名
    * @param model モデル名
    * @returns 戻り値なし
    */
  recordSuccess(provider: string, model: string): void {
    const key = this.getKey(provider, model);
    const state = this.getOrCreateState(key, provider, model);

    // Gradually restore burst capacity
    state.burstTokensUsed = Math.max(0, state.burstTokensUsed - 1);

    // Gradually restore burst multiplier
    const config = this.getConfig(provider, model);
    state.burstMultiplier = Math.min(
      config.burstMultiplier,
      state.burstMultiplier + 0.05
    );

    // Gradually restore refill rate
    const baseRefillRate = config.rpm / 60;
    state.refillRate = Math.min(baseRefillRate, state.refillRate + 0.1);
  }

   /**
    * 現在の統計情報を取得する
    * @returns 統計情報オブジェクト
    */
  getStats(): RateLimiterStats {
    const now = Date.now();
    const trackedModels = this.buckets.size;
    const blockedModels: string[] = [];
    const lowCapacityModels: string[] = [];
    let totalAvailable = 0;

    for (const [key, state] of this.buckets) {
      // Check if blocked
      if (state.retryAfterMs > now) {
        blockedModels.push(key);
      }

      // Refill and check capacity
      this.refillTokens(state);
      const capacityRatio = state.tokens / state.maxTokens;
      totalAvailable += state.tokens;

      if (capacityRatio < 0.2) {
        lowCapacityModels.push(key);
      }
    }

    return {
      trackedModels,
      blockedModels,
      avgAvailableTokens: trackedModels > 0 ? totalAvailable / trackedModels : 0,
      lowCapacityModels,
    };
  }

   /**
    * 指定したプロバイダー/モデルのレート制限を設定
    * @param provider プロバイダー名
    * @param model モデル名
    * @param config レート制限設定
    * @returns なし
    */
  configure(provider: string, model: string, config: Partial<RateLimitConfig>): void {
    const key = this.getKey(provider, model);
    const existing = this.configs.get(key) ?? DEFAULT_CONFIGS["default:default"];
    this.configs.set(key, { ...existing, ...config });

    // Update existing bucket if present
    const state = this.buckets.get(key);
    if (state) {
      const newConfig = this.configs.get(key)!;
      state.maxTokens = newConfig.rpm / 60; // Tokens per second
      state.refillRate = newConfig.rpm / 60;
    }
  }

   /**
    * 指定したバケットをリセットする
    * @param provider プロバイダ名
    * @param model モデル名
    * @returns なし
    */
  reset(provider: string, model: string): void {
    const key = this.getKey(provider, model);
    this.buckets.delete(key);
  }

   /**
    * すべてのバケットをリセットする。
    * @returns 戻り値なし
    */
  resetAll(): void {
    this.buckets.clear();
  }

   /**
    * デバッグ用にバケット状態を取得
    * @param provider プロバイダ名
    * @param model モデル名
    * @returns バケット状態のコピー、存在しない場合はundefined
    */
  getBucketState(provider: string, model: string): TokenBucketState | undefined {
    const key = this.getKey(provider, model);
    const state = this.buckets.get(key);
    return state ? { ...state } : undefined;
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private getKey(provider: string, model: string): string {
    return `${provider.toLowerCase()}:${model.toLowerCase()}`;
  }

  private getConfig(provider: string, model: string): RateLimitConfig {
    const key = this.getKey(provider, model);
    const specific = this.configs.get(key);
    if (specific) return specific;

    // Try provider default
    const providerKey = `${provider.toLowerCase()}:default`;
    const providerDefault = this.configs.get(providerKey);
    if (providerDefault) return providerDefault;

    // Fall back to global default
    return DEFAULT_CONFIGS["default:default"];
  }

  private getOrCreateState(key: string, provider: string, model: string): TokenBucketState {
    let state = this.buckets.get(key);
    if (!state) {
      const config = this.getConfig(provider, model);
      const tokensPerSecond = config.rpm / 60;

      state = {
        tokens: tokensPerSecond * 10, // Start with 10 seconds worth
        maxTokens: tokensPerSecond * 60, // 1 minute worth max
        refillRate: tokensPerSecond,
        lastRefillMs: Date.now(),
        retryAfterMs: 0,
        burstMultiplier: config.burstMultiplier,
        burstTokensUsed: 0,
      };

      this.buckets.set(key, state);
    }
    return state;
  }

  private refillTokens(state: TokenBucketState): void {
    const now = Date.now();
    const elapsedMs = now - state.lastRefillMs;

    if (elapsedMs <= 0) return;

    const tokensToAdd = (state.refillRate * elapsedMs) / 1000;
    state.tokens = Math.min(state.maxTokens, state.tokens + tokensToAdd);
    state.lastRefillMs = now;

    // Gradually reduce burst tokens used over time
    if (elapsedMs > BURST_COOLDOWN_MS) {
      state.burstTokensUsed = Math.max(0, state.burstTokensUsed - Math.floor(elapsedMs / BURST_COOLDOWN_MS));
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let limiterInstance: TokenBucketRateLimiterImpl | null = null;

 /**
  * シングルトンのレートリミッターを取得する。
  * @returns レートリミッターのインスタンス。
  */
export function getTokenBucketRateLimiter(): TokenBucketRateLimiterImpl {
  if (!limiterInstance) {
    limiterInstance = new TokenBucketRateLimiterImpl();
  }
  return limiterInstance;
}

 /**
  * 新しいレート制限インスタンスを作成（テスト用）
  * @returns 新しいTokenBucketRateLimiterImplインスタンス
  */
export function createTokenBucketRateLimiter(): TokenBucketRateLimiterImpl {
  return new TokenBucketRateLimiterImpl();
}

 /**
  * シングルトンのレートリミッターをリセット
  */
export function resetTokenBucketRateLimiter(): void {
  limiterInstance = null;
}

// ============================================================================
// Basic Test Cases (as comments)
// ============================================================================

/**
 * Basic Test Cases:
 *
 * 1. Basic Rate Limiting:
 *    - Create limiter with 60 RPM
 *    - Call canProceed() -> expect 0 (can proceed)
 *    - Consume 1 token
 *    - Call canProceed() immediately -> expect small wait
 *
 * 2. Burst Tolerance:
 *    - Create limiter with burstMultiplier=2
 *    - Consume more than base tokens
 *    - Expect canProceed() to still return 0
 *
 * 3. Provider/Model Separation:
 *    - Consume tokens for provider A
 *    - Check canProceed() for provider B -> expect 0
 *
 * Edge Cases:
 *
 * 4. Empty Bucket:
 *    - Consume all tokens
 *    - canProceed() with 1 token -> expect wait > 0
 *
 * 5. Maximum Tokens:
 *    - Configure very high RPM
 *    - Verify maxTokens is clamped reasonably
 *
 * 6. 429 Error Handling:
 *    - Call record429()
 *    - canProceed() -> expect wait until retry-after
 *    - burstMultiplier reduced
 *    - refillRate reduced
 *
 * 7. Recovery After 429:
 *    - Record 429 with 60s retry
 *    - Wait for retry-after to pass
 *    - recordSuccess() multiple times
 *    - Verify burstMultiplier gradually restored
 *
 * 8. Concurrent Access:
 *    - Multiple canProceed() calls
 *    - Multiple consume() calls
 *    - Verify state remains consistent
 */

// Export implementation class for testing
export { TokenBucketRateLimiterImpl };
