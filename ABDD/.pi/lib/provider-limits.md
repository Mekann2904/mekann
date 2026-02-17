---
title: Provider Limits
category: reference
audience: developer
last_updated: 2026-02-18
tags: [provider, limits, rate-limit, concurrency]
related: []
---

# Provider Limits Registry

各プロバイダー/モデルのレート制限と同時実行制限を定義する。公式ドキュメントとコミュニティの知識に基づく。

## 型定義

### ModelLimits

モデルの制限を表すインターフェース。

```typescript
interface ModelLimits {
  rpm: number;              // 1分あたりのリクエスト数
  tpm?: number;             // 1分あたりのトークン数（オプション）
  concurrency: number;      // 最大同時リクエスト数
  description?: string;     // デバッグ用の説明
}
```

### ModelTierLimits

モデルのティア別制限を表すインターフェース。

```typescript
interface ModelTierLimits {
  tiers: {
    [tier: string]: ModelLimits;
  };
  default?: ModelLimits;    // 不明なティアの場合のフォールバック
}
```

### ProviderLimitsConfig

プロバイダー制限設定を表すインターフェース。

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

解決済みモデル制限を表すインターフェース。

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

## 関数

### getLimitsConfig

有効な制限設定（ビルトイン + ユーザーオーバーライド）を取得する。

```typescript
function getLimitsConfig(): ProviderLimitsConfig
```

### reloadLimits

ディスクから制限を再読み込みする。

```typescript
function reloadLimits(): void
```

### resolveLimits

特定のプロバイダー/モデル/ティアの制限を解決する。

```typescript
function resolveLimits(
  provider: string,
  model: string,
  tier?: string
): ResolvedModelLimits
```

### getConcurrencyLimit

プロバイダー/モデルの同時実行制限を取得する。

```typescript
function getConcurrencyLimit(provider: string, model: string, tier?: string): number
```

### getRpmLimit

プロバイダー/モデルのRPM制限を取得する。

```typescript
function getRpmLimit(provider: string, model: string, tier?: string): number
```

### listProviders

既知の全プロバイダーをリストする。

```typescript
function listProviders(): string[]
```

### listModels

プロバイダーの全モデルをリストする。

```typescript
function listModels(provider: string): string[]
```

### saveUserLimits

ユーザー制限を保存する（カスタマイズ用）。

```typescript
function saveUserLimits(limits: ProviderLimitsConfig): void
```

### getBuiltinLimits

ビルトイン制限を取得する（参照用）。

```typescript
function getBuiltinLimits(): ProviderLimitsConfig
```

### detectTier

環境変数またはアカウント情報からティアを検出する。

```typescript
function detectTier(provider: string, model: string): string | undefined
```

### formatLimitsSummary

制限の人間が読めるサマリーを作成する。

```typescript
function formatLimitsSummary(limits: ResolvedModelLimits): string
```

## サポートされるプロバイダー

- **anthropic**: Claude 4.x, Claude 3.5, Claude 3 シリーズ
- **openai**: GPT-4o, GPT-4-turbo, GPT-4, o1 シリーズ
- **google**: Gemini 2.5, Gemini 2.0, Gemini 1.5 シリーズ
- **mistral**: Mistral Large, Mistral Medium, Codestral
- **groq**: Llama, Mixtral シリーズ
- **cerebras**: 全モデル
- **xai**: Grok シリーズ

## 環境変数

- `PI_PROVIDER_TIER`: 全プロバイダーのティアを設定
- `PI_<PROVIDER>_TIER`: プロバイダー固有のティアを設定（例: `PI_ANTHROPIC_TIER`）
