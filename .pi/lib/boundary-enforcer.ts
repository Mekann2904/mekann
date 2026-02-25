/**
 * @abdd.meta
 * path: .pi/lib/boundary-enforcer.ts
 * role: システム境界条件を強制し、リソース制限を超える操作を防止する
 * why: システムの安定性を保つために、並列数、タイムアウト、リトライ回数などの上限を強制するため
 * related: .pi/lib/runtime-config.ts, .pi/lib/provider-limits.ts
 * public_api: BoundaryEnforcer, BoundaryViolationError, BoundaryLimits
 * invariants: すべての境界値は正の整数である
 * side_effects: なし（純粋な関数）
 * failure_modes: 境界違反時にBoundaryViolationErrorをスロー
 * @abdd.explain
 * overview: システムリソースの使用制限を強制する境界エンフォーサー
 * what_it_does:
 *   - 同時実行数の上限を強制する
 *   - タイムアウト制限を強制する
 *   - リトライ回数の上限を強制する
 *   - 境界違反を検出してエラーを報告する
 * why_it_exists:
 *   - システムの過負荷を防止するため
 *   - 予測可能な動作を保証するため
 *   - リソース枯渇を防ぐため
 * scope:
 *   in: 境界定義、現在の使用量
 *   out: 検証結果、エラー
 */

/**
 * Boundary Enforcer - Enforces system boundary conditions.
 *
 * Phase 4.2: Medium Priority - Boundary Conditions
 *
 * This module enforces limits on concurrency, timeouts, and retries
 * to prevent system overload and ensure predictable behavior.
 */

/**
 * 境界制限定義
 * @summary 境界制限
 */
export interface BoundaryLimits {
  maxConcurrency: number;
  maxTimeout: number;
  maxRetries: number;
  maxRateLimitWait: number;
  maxQueueSize: number;
}

/**
 * デフォルトの境界制限
 * @summary デフォルト制限
 */
export const DEFAULT_BOUNDARY_LIMITS: BoundaryLimits = {
  maxConcurrency: 64,
  maxTimeout: 600_000, // 10 minutes
  maxRetries: 10,
  maxRateLimitWait: 120_000, // 2 minutes
  maxQueueSize: 10_000
};

/**
 * 境界違反エラー
 * @summary 境界違反エラー
 */
export class BoundaryViolationError extends Error {
  constructor(
    public readonly boundary: string,
    public readonly value: number,
    public readonly limit: number,
    message?: string
  ) {
    super(message || `Boundary violation: ${boundary}=${value} exceeds limit=${limit}`);
    this.name = 'BoundaryViolationError';
  }
}

/**
 * 境界エンフォーサークラス
 * @summary 境界エンフォーサー
 */
export class BoundaryEnforcer {
  private readonly limits: BoundaryLimits;
  private violations: Array<{ boundary: string; value: number; limit: number; timestamp: Date }> = [];

  constructor(limits: Partial<BoundaryLimits> = {}) {
    this.limits = { ...DEFAULT_BOUNDARY_LIMITS, ...limits };
  }

  /**
   * 現在の制限を取得
   * @summary 制限取得
   * @returns 境界制限
   */
  getLimits(): BoundaryLimits {
    return { ...this.limits };
  }

  /**
   * 同時実行数を強制
   * @summary 同時実行数強制
   * @param current - 現在の同時実行数
   * @throws 制限を超える場合
   */
  enforceConcurrency(current: number): void {
    if (current > this.limits.maxConcurrency) {
      this.recordViolation('concurrency', current, this.limits.maxConcurrency);
      throw new BoundaryViolationError(
        'concurrency',
        current,
        this.limits.maxConcurrency,
        `Concurrency ${current} exceeds limit ${this.limits.maxConcurrency}`
      );
    }
  }

  /**
   * タイムアウトを強制
   * @summary タイムアウト強制
   * @param elapsed - 経過時間（ミリ秒）
   * @throws 制限を超える場合
   */
  enforceTimeout(elapsed: number): void {
    if (elapsed > this.limits.maxTimeout) {
      this.recordViolation('timeout', elapsed, this.limits.maxTimeout);
      throw new BoundaryViolationError(
        'timeout',
        elapsed,
        this.limits.maxTimeout,
        `Timeout exceeded: ${elapsed}ms > ${this.limits.maxTimeout}ms`
      );
    }
  }

  /**
   * リトライ回数を強制
   * @summary リトライ強制
   * @param retries - 現在のリトライ回数
   * @throws 制限を超える場合
   */
  enforceRetries(retries: number): void {
    if (retries > this.limits.maxRetries) {
      this.recordViolation('retries', retries, this.limits.maxRetries);
      throw new BoundaryViolationError(
        'retries',
        retries,
        this.limits.maxRetries,
        `Retry count ${retries} exceeds limit ${this.limits.maxRetries}`
      );
    }
  }

  /**
   * レート制限待機時間を強制
   * @summary レート制限待機強制
   * @param waitMs - 待機時間（ミリ秒）
   * @throws 制限を超える場合
   */
  enforceRateLimitWait(waitMs: number): void {
    if (waitMs > this.limits.maxRateLimitWait) {
      this.recordViolation('rateLimitWait', waitMs, this.limits.maxRateLimitWait);
      throw new BoundaryViolationError(
        'rateLimitWait',
        waitMs,
        this.limits.maxRateLimitWait,
        `Rate limit wait ${waitMs}ms exceeds limit ${this.limits.maxRateLimitWait}ms`
      );
    }
  }

  /**
   * キューサイズを強制
   * @summary キューサイズ強制
   * @param size - 現在のキューサイズ
   * @throws 制限を超える場合
   */
  enforceQueueSize(size: number): void {
    if (size > this.limits.maxQueueSize) {
      this.recordViolation('queueSize', size, this.limits.maxQueueSize);
      throw new BoundaryViolationError(
        'queueSize',
        size,
        this.limits.maxQueueSize,
        `Queue size ${size} exceeds limit ${this.limits.maxQueueSize}`
      );
    }
  }

  /**
   * 値を指定された範囲内にクランプ
   * @summary 値のクランプ
   * @param value - 元の値
   * @param min - 最小値
   * @param max - 最大値
   * @returns クランプされた値
   */
  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 同時実行数をクランプ
   * @summary 同時実行数クランプ
   * @param value - 元の値
   * @returns クランプされた値
   */
  clampConcurrency(value: number): number {
    return this.clamp(value, 1, this.limits.maxConcurrency);
  }

  /**
   * タイムアウトをクランプ
   * @summary タイムアウトクランプ
   * @param value - 元の値
   * @returns クランプされた値
   */
  clampTimeout(value: number): number {
    return this.clamp(value, 0, this.limits.maxTimeout);
  }

  /**
   * リトライ回数をクランプ
   * @summary リトライクランプ
   * @param value - 元の値
   * @returns クランプされた値
   */
  clampRetries(value: number): number {
    return this.clamp(value, 0, this.limits.maxRetries);
  }

  /**
   * 違反を記録
   * @summary 違反記録
   * @param boundary - 境界名
   * @param value - 値
   * @param limit - 制限
   */
  private recordViolation(boundary: string, value: number, limit: number): void {
    this.violations.push({
      boundary,
      value,
      limit,
      timestamp: new Date()
    });
  }

  /**
   * 違反履歴を取得
   * @summary 違反履歴取得
   * @returns 違反履歴
   */
  getViolations(): Array<{ boundary: string; value: number; limit: number; timestamp: Date }> {
    return [...this.violations];
  }

  /**
   * 違反履歴をクリア
   * @summary 違反履歴クリア
   */
  clearViolations(): void {
    this.violations = [];
  }

  /**
   * 違反統計を取得
   * @summary 違反統計取得
   * @returns 境界ごとの違反回数
   */
  getViolationStats(): Map<string, number> {
    const stats = new Map<string, number>();
    for (const violation of this.violations) {
      const count = stats.get(violation.boundary) || 0;
      stats.set(violation.boundary, count + 1);
    }
    return stats;
  }
}

// デフォルトインスタンス
let defaultEnforcer: BoundaryEnforcer | null = null;

/**
 * デフォルトの境界エンフォーサーを取得
 * @summary デフォルトエンフォーサー取得
 * @param limits - オプションの制限上書き
 * @returns 境界エンフォーサー
 */
export function getBoundaryEnforcer(limits?: Partial<BoundaryLimits>): BoundaryEnforcer {
  if (!defaultEnforcer) {
    defaultEnforcer = new BoundaryEnforcer(limits);
  }
  return defaultEnforcer;
}

/**
 * 境界エンフォーサーをリセット
 * @summary エンフォーサーリセット
 */
export function resetBoundaryEnforcer(): void {
  defaultEnforcer = null;
}
