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
| 関数 | `getLimitsConfig` | 有効な制限設定を取得する（標準＋ユーザー設定）。 |
| 関数 | `reloadLimits` | ディスクから制限設定を再読み込みする |
| 関数 | `resolveLimits` | 指定したプロバイダ/モデル/ティアの制限を解決する |
| 関数 | `getConcurrencyLimit` | プロバイダーとモデルの並列処理数上限を取得 |
| 関数 | `getRpmLimit` | プロバイダー/モデルのRPM制限を取得 |
| 関数 | `listProviders` | 既知のすべてのプロバイダー一覧を取得 |
| 関数 | `listModels` | 指定プロバイダーのモデル一覧を取得 |
| 関数 | `saveUserLimits` | ユーザー制限を保存する |
| 関数 | `getBuiltinLimits` | 組み込みの制限設定を取得する（参照用） |
| 関数 | `detectTier` | 環境変数からティアを検出します。 |
| 関数 | `formatLimitsSummary` | 制限情報を読みやすい文字列でフォーマットする |
| インターフェース | `ModelLimits` | モデルごとのAPIレート制限を定義 |
| インターフェース | `ModelTierLimits` | モデルティア別の制限設定 |
| インターフェース | `ProviderLimitsConfig` | プロバイダー制限設定を表すインターフェース |
| インターフェース | `ResolvedModelLimits` | 解決されたモデル制限 |

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

有効な制限設定を取得する（標準＋ユーザー設定）。

**戻り値**: `ProviderLimitsConfig`

### reloadLimits

```typescript
reloadLimits(): void
```

ディスクから制限設定を再読み込みする

**戻り値**: `void`

### resolveLimits

```typescript
resolveLimits(provider: string, model: string, tier?: string): ResolvedModelLimits
```

指定したプロバイダ/モデル/ティアの制限を解決する

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

プロバイダーとモデルの並列処理数上限を取得

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

プロバイダー/モデルのRPM制限を取得

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

既知のすべてのプロバイダー一覧を取得

**戻り値**: `string[]`

### listModels

```typescript
listModels(provider: string): string[]
```

指定プロバイダーのモデル一覧を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |

**戻り値**: `string[]`

### saveUserLimits

```typescript
saveUserLimits(limits: ProviderLimitsConfig): void
```

ユーザー制限を保存する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| limits | `ProviderLimitsConfig` | はい |

**戻り値**: `void`

### getBuiltinLimits

```typescript
getBuiltinLimits(): ProviderLimitsConfig
```

組み込みの制限設定を取得する（参照用）

**戻り値**: `ProviderLimitsConfig`

### detectTier

```typescript
detectTier(provider: string, _model: string): string | undefined
```

環境変数からティアを検出します。

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

制限情報を読みやすい文字列でフォーマットする

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

モデルごとのAPIレート制限を定義

### ModelTierLimits

```typescript
interface ModelTierLimits {
  tiers: {
    [tier: string]: ModelLimits;
  };
  default?: ModelLimits;
}
```

モデルティア別の制限設定

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

プロバイダー制限設定を表すインターフェース

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

解決されたモデル制限

---
*自動生成: 2026-02-18T07:48:45.076Z*
