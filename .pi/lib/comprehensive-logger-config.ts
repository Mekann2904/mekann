/**
 * @abdd.meta
 * path: .pi/lib/comprehensive-logger-config.ts
 * role: ロガー設定の定義、環境変数からの上書きロード、および入力値検証を行うコンフィグレーションモジュール
 * why: ログシステムの振る舞い（出力先、バッファサイズ、保持期間など）を一元管理し、実行環境（開発・本番）に応じて柔軟に変更するため
 * related: .pi/lib/comprehensive-logger-types.ts
 * public_api: DEFAULT_CONFIG, loadConfigFromEnv, validateConfig
 * invariants: config.bufferSizeは1以上、config.flushIntervalMsは100ms以上、maxFileSizeMBおよびretentionDaysは1以上
 * side_effects: process.envからの読み取りによる設定値の書き換え（loadConfigFromEnv関数）
 * failure_modes: 環境変数の型変換失敗（parseIntなど）、不正な環境名やログレベルの指定による検証エラー
 * @abdd.explain
 * overview: ログ出力に関する設定値のデフォルト定義、環境変数による動的設定、および設定値の整合性チェック機能を提供する
 * what_it_does:
 *   - LoggerConfig型のデフォルト値（DEFAULT_CONFIG）を定義する
 *   - 環境変数（PI_LOG_*）を読み込み、型変換して設定を上書きする
 *   - 設定オブジェクトのバリデーションを行い、エラー詳細を返す
 * why_it_exists:
 *   - ログ出力制御をハードコードから分離し、環境ごとのチューニングを可能にする
 *   - 設定ミス（負のバッファサイズや無効な文字列など）を早期に検出する
 * scope:
 *   in: 環境変数 (process.env)、ベース設定オブジェクト (LoggerConfig)
 *   out: 環境変数でマージされた設定オブジェクト、バリデーション結果
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
