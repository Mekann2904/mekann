/**
 * @abdd.meta
 * path: .pi/lib/comprehensive-logger-config.ts
 * role: ログ収集システムの設定管理と環境変数ベースの設定上書き、および設定バリデーション
 * why: ログシステムの動作を環境変数で制御可能にし、設定値の正当性を保証するため
 * related: comprehensive-logger-types.ts, comprehensive-logger.ts, .env
 * public_api: DEFAULT_CONFIG, loadConfigFromEnv, validateConfig
 * invariants: DEFAULT_CONFIGは常に有効なデフォルト値を持つ、validateConfigは必ず{valid, errors}構造を返す
 * side_effects: loadConfigFromEnvがprocess.envを読み取る
 * failure_modes: 環境変数の数値変換でNaNが発生する可能性、不正な環境変数値による設定不整合
 * @abdd.explain
 * overview: 包括的ログ収集システムの設定を管理するモジュール
 * what_it_does:
 *   - デフォルト設定(DEFAULT_CONFIG)の定義とエクスポート
 *   - 環境変数(PI_LOG_*)からの設定読み込みと型変換
 *   - 設定値の妥当性検証(最小値、列挙値のチェック)
 * why_it_exists:
 *   - ログシステムの動作をデプロイ環境ごとに設定可能にするため
 *   - 設定ミスによるログシステムの誤動作を防ぐため
 * scope:
 *   in: LoggerConfig型の設定オブジェクト、環境変数(process.env)
 *   out: 検証済みのLoggerConfig、バリデーション結果
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
  * 環境変数から設定を読み込む
  * @param baseConfig ベースとなる設定
  * @returns 環境変数で上書きされた設定
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
