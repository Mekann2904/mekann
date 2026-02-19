---
title: comprehensive-logger-config
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# comprehensive-logger-config

## 概要

`comprehensive-logger-config` モジュールのAPIリファレンス。

## インポート

```typescript
// from './comprehensive-logger-types': LoggerConfig
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `loadConfigFromEnv` | 環境変数から設定を読込 |
| 関数 | `validateConfig` | ロガー設定を検証する |
| 関数 | `getConfig` | - |
| 関数 | `resetConfig` | 設定をリセットする |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[comprehensive-logger-config]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    comprehensive_logger_types["comprehensive-logger-types"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  getConfig["getConfig()"]
  loadConfigFromEnv["loadConfigFromEnv()"]
  parseEnvValue["parseEnvValue()"]
  resetConfig["resetConfig()"]
  validateConfig["validateConfig()"]
  getConfig --> loadConfigFromEnv
  getConfig --> validateConfig
  loadConfigFromEnv --> parseEnvValue
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant comprehensive_logger_config as "comprehensive-logger-config"
  participant comprehensive_logger_types as "comprehensive-logger-types"

  Caller->>comprehensive_logger_config: loadConfigFromEnv()
  comprehensive_logger_config->>comprehensive_logger_types: 内部関数呼び出し
  comprehensive_logger_types-->>comprehensive_logger_config: 結果
  comprehensive_logger_config-->>Caller: LoggerConfig

  Caller->>comprehensive_logger_config: validateConfig()
  comprehensive_logger_config-->>Caller: valid_boolean_error
```

## 関数

### parseEnvValue

```typescript
parseEnvValue(value: string, type: string): unknown
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |
| type | `string` | はい |

**戻り値**: `unknown`

### loadConfigFromEnv

```typescript
loadConfigFromEnv(baseConfig: LoggerConfig): LoggerConfig
```

環境変数から設定を読込

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| baseConfig | `LoggerConfig` | はい |

**戻り値**: `LoggerConfig`

### validateConfig

```typescript
validateConfig(config: LoggerConfig): { valid: boolean; errors: string[] }
```

ロガー設定を検証する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| config | `LoggerConfig` | はい |

**戻り値**: `{ valid: boolean; errors: string[] }`

### getConfig

```typescript
getConfig(): LoggerConfig
```

**戻り値**: `LoggerConfig`

### resetConfig

```typescript
resetConfig(): void
```

設定をリセットする

**戻り値**: `void`

---
*自動生成: 2026-02-18T18:06:17.488Z*
