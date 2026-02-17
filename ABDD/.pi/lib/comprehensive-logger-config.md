---
title: comprehensive-logger-config
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# comprehensive-logger-config

## 概要

`comprehensive-logger-config` モジュールのAPIリファレンス。

## インポート

```typescript
import { LoggerConfig } from './comprehensive-logger-types';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `loadConfigFromEnv` | - |
| 関数 | `validateConfig` | - |
| 関数 | `getConfig` | - |
| 関数 | `resetConfig` | - |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[comprehensive-logger-config]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    comprehensive_logger_types[comprehensive-logger-types]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  loadConfigFromEnv["loadConfigFromEnv()"]
  validateConfig["validateConfig()"]
  getConfig["getConfig()"]
  resetConfig["resetConfig()"]
  loadConfigFromEnv -.-> validateConfig
  validateConfig -.-> getConfig
  getConfig -.-> resetConfig
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant comprehensive_logger_config as comprehensive-logger-config
  participant comprehensive_logger_types as comprehensive-logger-types

  Caller->>comprehensive_logger_config: loadConfigFromEnv()
  comprehensive_logger_config->>comprehensive_logger_types: 内部関数呼び出し
  comprehensive_logger_types-->>comprehensive_logger_config: 結果
  comprehensive_logger_config-->>Caller: LoggerConfig

  Caller->>comprehensive_logger_config: validateConfig()
  comprehensive_logger_config-->>Caller: { valid: boolean; errors: string[] }
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

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| baseConfig | `LoggerConfig` | はい |

**戻り値**: `LoggerConfig`

### validateConfig

```typescript
validateConfig(config: LoggerConfig): { valid: boolean; errors: string[] }
```

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

**戻り値**: `void`

---
*自動生成: 2026-02-17T22:16:16.614Z*
