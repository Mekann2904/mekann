---
title: provider-limits
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# provider-limits

## 概要

`provider-limits` モジュールのAPIリファレンス。

## インポート

```typescript
import { readFileSync, existsSync, writeFileSync... } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getLimitsConfig` | Get the effective limits configuration (builtin +  |
| 関数 | `reloadLimits` | Reload limits from disk. |
| 関数 | `resolveLimits` | Resolve limits for a specific provider/model/tier. |
| 関数 | `getConcurrencyLimit` | Get concurrency limit for a provider/model. |
| 関数 | `getRpmLimit` | Get RPM limit for a provider/model. |
| 関数 | `listProviders` | List all known providers. |
| 関数 | `listModels` | List all models for a provider. |
| 関数 | `saveUserLimits` | Save user limits (for customization). |
| 関数 | `getBuiltinLimits` | Get the builtin limits (for reference). |
| 関数 | `detectTier` | Detect tier from environment or account info. |
| 関数 | `formatLimitsSummary` | Build a human-readable summary of limits. |
| インターフェース | `ModelLimits` | - |
| インターフェース | `ModelTierLimits` | - |
| インターフェース | `ProviderLimitsConfig` | - |
| インターフェース | `ResolvedModelLimits` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class ModelLimits {
    <<interface>>
    +rpm: number
    +tpm: number
    +concurrency: number
    +description: string
  }
  class ModelTierLimits {
    <<interface>>
    +tiers: tier_string_Model
    +default: ModelLimits
  }
  class ProviderLimitsConfig {
    <<interface>>
    +version: number
    +lastUpdated: string
    +source: string
    +providers: provider_string
  }
  class ResolvedModelLimits {
    <<interface>>
    +provider: string
    +model: string
    +tier: string
    +rpm: number
    +tpm: number_undefined
  }
```

### 関数フロー

```mermaid
flowchart TD
  getLimitsConfig["getLimitsConfig()"]
  reloadLimits["reloadLimits()"]
  resolveLimits["resolveLimits()"]
  getConcurrencyLimit["getConcurrencyLimit()"]
  getRpmLimit["getRpmLimit()"]
  listProviders["listProviders()"]
  getLimitsConfig -.-> reloadLimits
  reloadLimits -.-> resolveLimits
  resolveLimits -.-> getConcurrencyLimit
  getConcurrencyLimit -.-> getRpmLimit
  getRpmLimit -.-> listProviders
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant provider_limits as "provider-limits"

  Caller->>provider_limits: getLimitsConfig()
  provider_limits-->>Caller: ProviderLimitsConfig

  Caller->>provider_limits: reloadLimits()
  provider_limits-->>Caller: void
```

## 関数

### matchesPattern

```typescript
matchesPattern(model: string, pattern: string): boolean
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| model | `string` | はい |
| pattern | `string` | はい |

**戻り値**: `boolean`

### loadUserLimits

```typescript
loadUserLimits(): ProviderLimitsConfig | null
```

**戻り値**: `ProviderLimitsConfig | null`

### mergeLimits

```typescript
mergeLimits(builtin: ProviderLimitsConfig, user: ProviderLimitsConfig | null): ProviderLimitsConfig
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| builtin | `ProviderLimitsConfig` | はい |
| user | `ProviderLimitsConfig | null` | はい |

**戻り値**: `ProviderLimitsConfig`

### getLimitsConfig

```typescript
getLimitsConfig(): ProviderLimitsConfig
```

Get the effective limits configuration (builtin + user overrides).

**戻り値**: `ProviderLimitsConfig`

### reloadLimits

```typescript
reloadLimits(): void
```

Reload limits from disk.

**戻り値**: `void`

### resolveLimits

```typescript
resolveLimits(provider: string, model: string, tier?: string): ResolvedModelLimits
```

Resolve limits for a specific provider/model/tier.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| tier | `string` | いいえ |

**戻り値**: `ResolvedModelLimits`

### getConcurrencyLimit

```typescript
getConcurrencyLimit(provider: string, model: string, tier?: string): number
```

Get concurrency limit for a provider/model.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| tier | `string` | いいえ |

**戻り値**: `number`

### getRpmLimit

```typescript
getRpmLimit(provider: string, model: string, tier?: string): number
```

Get RPM limit for a provider/model.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| tier | `string` | いいえ |

**戻り値**: `number`

### listProviders

```typescript
listProviders(): string[]
```

List all known providers.

**戻り値**: `string[]`

### listModels

```typescript
listModels(provider: string): string[]
```

List all models for a provider.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |

**戻り値**: `string[]`

### saveUserLimits

```typescript
saveUserLimits(limits: ProviderLimitsConfig): void
```

Save user limits (for customization).

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| limits | `ProviderLimitsConfig` | はい |

**戻り値**: `void`

### getBuiltinLimits

```typescript
getBuiltinLimits(): ProviderLimitsConfig
```

Get the builtin limits (for reference).

**戻り値**: `ProviderLimitsConfig`

### detectTier

```typescript
detectTier(provider: string, _model: string): string | undefined
```

Detect tier from environment or account info.
This is a placeholder - real detection would need API calls.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| _model | `string` | はい |

**戻り値**: `string | undefined`

### formatLimitsSummary

```typescript
formatLimitsSummary(limits: ResolvedModelLimits): string
```

Build a human-readable summary of limits.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| limits | `ResolvedModelLimits` | はい |

**戻り値**: `string`

## インターフェース

### ModelLimits

```typescript
interface ModelLimits {
  rpm: number;
  tpm?: number;
  concurrency: number;
  description?: string;
}
```

### ModelTierLimits

```typescript
interface ModelTierLimits {
  tiers: {
    [tier: string]: ModelLimits;
  };
  default?: ModelLimits;
}
```

### ProviderLimitsConfig

```typescript
interface ProviderLimitsConfig {
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
```

### ResolvedModelLimits

```typescript
interface ResolvedModelLimits {
  provider: string;
  model: string;
  tier: string;
  rpm: number;
  tpm: number | undefined;
  concurrency: number;
  source: "preset" | "fallback" | "default";
}
```

---
*自動生成: 2026-02-18T00:15:35.745Z*
