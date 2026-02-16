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

export function getConfig(): LoggerConfig {
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
