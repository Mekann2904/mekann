---
title: comprehensive-logger-config.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [logger, config, environment]
related: [comprehensive-logger-types.ts, comprehensive-logger.ts]
---

# comprehensive-logger-config.ts

包括的ログ収集システムの設定管理。

## 概要

ロガーの設定読み込みと管理を担当する。環境変数からの設定オーバーライドをサポートする。

## 定数

### DEFAULT_CONFIG

```typescript
const DEFAULT_CONFIG: LoggerConfig = {
  logDir: '.pi/logs',
  enabled: true,
  bufferSize: 100,
  flushIntervalMs: 1000,
  maxFileSizeMB: 100,
  retentionDays: 30,
  environment: 'development',
  minLogLevel: 'info',
}
```

デフォルトロガー設定。

### PRODUCTION_PRESET

```typescript
const PRODUCTION_PRESET: Partial<LoggerConfig> = {
  bufferSize: 500,
  flushIntervalMs: 5000,
  maxFileSizeMB: 500,
  retentionDays: 90,
  environment: 'production',
  minLogLevel: 'info',
}
```

本番環境向けプリセット設定。

### DEVELOPMENT_PRESET

```typescript
const DEVELOPMENT_PRESET: Partial<LoggerConfig> = {
  bufferSize: 50,
  flushIntervalMs: 500,
  maxFileSizeMB: 50,
  retentionDays: 7,
  environment: 'development',
  minLogLevel: 'debug',
}
```

開発環境向けプリセット設定。

## 環境変数マッピング

| 環境変数 | 設定キー | 型 |
|----------|----------|-----|
| `PI_LOG_ENABLED` | `enabled` | boolean |
| `PI_LOG_DIR` | `logDir` | string |
| `PI_LOG_BUFFER_SIZE` | `bufferSize` | number |
| `PI_LOG_FLUSH_INTERVAL_MS` | `flushIntervalMs` | number |
| `PI_LOG_MAX_FILE_SIZE_MB` | `maxFileSizeMB` | number |
| `PI_LOG_RETENTION_DAYS` | `retentionDays` | number |
| `PI_LOG_ENVIRONMENT` | `environment` | string |
| `PI_LOG_MIN_LEVEL` | `minLogLevel` | string |

## 関数

### loadConfigFromEnv

環境変数から設定を読み込む。

```typescript
function loadConfigFromEnv(baseConfig: LoggerConfig = DEFAULT_CONFIG): LoggerConfig
```

**パラメータ**

| 名前 | 型 | 説明 |
|------|-----|------|
| `baseConfig` | `LoggerConfig?` | ベース設定（デフォルト: DEFAULT_CONFIG） |

**戻り値**

環境変数でオーバーライドされた設定。

### validateConfig

設定をバリデーションする。

```typescript
function validateConfig(config: LoggerConfig): { valid: boolean; errors: string[] }
```

**バリデーションルール**

- `bufferSize` >= 1
- `flushIntervalMs` >= 100
- `maxFileSizeMB` >= 1
- `retentionDays` >= 1
- `environment` in ['development', 'production', 'test']
- `minLogLevel` in ['debug', 'info', 'warn', 'error']

**戻り値**

- `valid`: バリデーション結果
- `errors`: エラーメッセージ配列

### getConfig

キャッシュされた設定を取得する。

```typescript
function getConfig(): LoggerConfig
```

初回呼び出し時に環境変数から読み込み、バリデーションを実行する。

### resetConfig

キャッシュされた設定をリセットする。

```typescript
function resetConfig(): void
```

## 使用例

```typescript
import {
  getConfig,
  loadConfigFromEnv,
  validateConfig,
  PRODUCTION_PRESET,
} from "./lib/comprehensive-logger-config.js";

// デフォルト設定を取得
const config = getConfig();

// 本番環境向け設定
const prodConfig = loadConfigFromEnv({
  ...DEFAULT_CONFIG,
  ...PRODUCTION_PRESET,
});

// バリデーション
const { valid, errors } = validateConfig(config);
if (!valid) {
  console.error("Config errors:", errors);
}
```

## 関連ファイル

- `.pi/lib/comprehensive-logger-types.ts` - ロガー型定義
- `.pi/lib/comprehensive-logger.ts` - ロガー実装
