/**
 * @abdd.meta
 * path: .pi/lib/comprehensive-logger-config.ts
 * role: ロガーの設定定数、環境変数からの読み込み、および設定バリデーションを提供する
 * why: ログ出力の振る舞いを環境ごとに制御し、設定ミスによるエラーを防ぐため
 * related: .pi/lib/comprehensive-logger-types.ts
 * public_api: DEFAULT_CONFIG, loadConfigFromEnv, validateConfig
 * invariants: bufferSize, flushIntervalMs, maxFileSizeMB, retentionDays は正の整数である必要がある
 * side_effects: 環境変数 process.env の値に基づいて設定オブジェクトを変更する
 * failure_modes: 環境変数の型変換失敗（parseInt等）、許容範囲外の値によるバリデーションエラー
 * @abdd.explain
 * overview: 包括的ログ収集システムの設定値を管理し、環境変数による上書きと妥当性チェックを行うモジュール
 * what_it_does:
 *   - デフォルト設定値（LoggerConfig）を定義する
 *   - 環境変数（PI_LOG_*）を解析し、設定値にマージする
 *   - 設定値が制約（最小値や許容リスト）を満たしているか検証する
 * why_it_exists:
 *   - ハードコードされた設定を避け、環境差異を吸収するため
 *   - 不正な設定が実行時にエラーを引き起こすのを防ぐため
 * scope:
 *   in: process.env, ベースとなる設定オブジェクト
 *   out: 環境変数がマージされた設定オブジェクト、バリデーション結果
 */

/**
 * 包括的ログ収集システム - 設定管理
 * 
 * ファイル: .pi/lib/comprehensive-logger-config.ts
 * 目的: ロガーの設定読み込みと管理
 */

import { LoggerConfig } from './comprehensive-logger-types';

// ============================================
// デフォルト設定
// ============================================

export const DEFAULT_CONFIG: LoggerConfig = {
  logDir: '.pi/logs',
  enabled: true,
  bufferSize: 100,
  flushIntervalMs: 1000,
  maxFileSizeMB: 100,
  retentionDays: 30,
  environment: 'development',
  minLogLevel: 'info',
};

// ============================================
// 環境変数マッピング
// ============================================

const ENV_MAPPING = {
  PI_LOG_ENABLED: { key: 'enabled', type: 'boolean' },
  PI_LOG_DIR: { key: 'logDir', type: 'string' },
  PI_LOG_BUFFER_SIZE: { key: 'bufferSize', type: 'number' },
  PI_LOG_FLUSH_INTERVAL_MS: { key: 'flushIntervalMs', type: 'number' },
  PI_LOG_MAX_FILE_SIZE_MB: { key: 'maxFileSizeMB', type: 'number' },
  PI_LOG_RETENTION_DAYS: { key: 'retentionDays', type: 'number' },
  PI_LOG_ENVIRONMENT: { key: 'environment', type: 'string' },
  PI_LOG_MIN_LEVEL: { key: 'minLogLevel', type: 'string' },
} as const;

// ============================================
// 設定読み込み
// ============================================

function parseEnvValue(value: string, type: string): unknown {
  switch (type) {
    case 'boolean':
      return value.toLowerCase() === 'true' || value === '1';
    case 'number':
      return parseInt(value, 10);
    case 'string':
    default:
      return value;
  }
}

/**
 * 環境変数から設定を読込
 * @summary 設定を読込
 * @param {LoggerConfig} baseConfig - ベースとなる設定オブジェクト
 * @returns {LoggerConfig} 環境変数でマージされた設定オブジェクト
 */
export function loadConfigFromEnv(baseConfig: LoggerConfig = DEFAULT_CONFIG): LoggerConfig {
  const config = { ...baseConfig };
  
  for (const [envKey, mapping] of Object.entries(ENV_MAPPING)) {
    const value = process.env[envKey];
    if (value !== undefined) {
      (config as Record<string, unknown>)[mapping.key] = parseEnvValue(value, mapping.type);
    }
  }
  
  return config;
}

// ============================================
// 設定バリデーション
// ============================================

/**
 * ロガー設定を検証する
 * @summary 設定を検証
 * @param config - 検証対象のロガー設定オブジェクト
 * @returns 検証結果オブジェクト。validは検証成功かどうか、errorsはエラーメッセージの配列
 */
export function validateConfig(config: LoggerConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.bufferSize < 1) {
    errors.push('bufferSize must be at least 1');
  }
  
  if (config.flushIntervalMs < 100) {
    errors.push('flushIntervalMs must be at least 100ms');
  }
  
  if (config.maxFileSizeMB < 1) {
    errors.push('maxFileSizeMB must be at least 1');
  }
  
  if (config.retentionDays < 1) {
    errors.push('retentionDays must be at least 1');
  }
  
  const validEnvironments = ['development', 'production', 'test'];
  if (!validEnvironments.includes(config.environment)) {
    errors.push(`environment must be one of: ${validEnvironments.join(', ')}`);
  }
  
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.minLogLevel)) {
    errors.push(`minLogLevel must be one of: ${validLogLevels.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// 設定ファクトリ
// ============================================

let cachedConfig: LoggerConfig | null = null;

/**
 * @summary 設定を取得
 * ロガーの設定を取得する
 * @returns ロガー設定オブジェクト
 */
export function getConfig(): LoggerConfig {
/**
   * キャッシュされた設定をクリアしてリセットする
   *
   * 設定のキャッシュを破棄し、次回取得時に再読み込みを強制します。
   * テスト時や設定の動的変更後に使用します。
   *
   * @returns 戻り値なし
   * @example
   * // 設定をリセット
   * resetConfig();
   * // 次回getConfig()呼び出し時に設定が再読み込みされる
   */
  if (cachedConfig === null) {
    cachedConfig = loadConfigFromEnv();
    const validation = validateConfig(cachedConfig);
    if (!validation.valid) {
      console.warn('[comprehensive-logger] Config validation errors:', validation.errors);
      cachedConfig = { ...DEFAULT_CONFIG };
    }
  }
  return cachedConfig;
}

/**
 * 設定をリセットする
 * @summary 設定をリセット
 * @param なし
 * @returns なし
 */
export function resetConfig(): void {
  cachedConfig = null;
}

// ============================================
// 本番環境向けプリセット
// ============================================

export const PRODUCTION_PRESET: Partial<LoggerConfig> = {
  bufferSize: 500,
  flushIntervalMs: 5000,
  maxFileSizeMB: 500,
  retentionDays: 90,
  environment: 'production',
  minLogLevel: 'info',
};

// ============================================
// 開発環境向けプリセット
// ============================================

export const DEVELOPMENT_PRESET: Partial<LoggerConfig> = {
  bufferSize: 50,
  flushIntervalMs: 500,
  maxFileSizeMB: 50,
  retentionDays: 7,
  environment: 'development',
  minLogLevel: 'debug',
};
