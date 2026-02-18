---
title: token-bucket
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# token-bucket

## 概要

`token-bucket` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getTokenBucketRateLimiter` | シングルトンのレートリミッターを取得する。 |
| 関数 | `createTokenBucketRateLimiter` | 新しいレート制限インスタンスを作成（テスト用） |
| 関数 | `resetTokenBucketRateLimiter` | シングルトンのレートリミッターをリセット |
| インターフェース | `RateLimitConfig` | レート制限の設定 |
| インターフェース | `RateLimiterStats` | レートリミッターの統計情報 |
| インターフェース | `TokenBucketRateLimiter` | トークンバケット方式のレート制限インターフェース |

## 図解

### クラス図

```mermaid
classDiagram
  class TokenBucketRateLimiterImpl {
    -buckets: Map_string_TokenBuck
    -configs: Map_string_RateLimit
    +canProceed()
    +consume()
    +record429()
    +recordSuccess()
    +getStats()
  }
  class TokenBucketState {
    <<interface>>
    +tokens: number
    +maxTokens: number
    +refillRate: number
    +lastRefillMs: number
    +retryAfterMs: number
  }
  class RateLimitConfig {
    <<interface>>
    +rpm: number
    +burstMultiplier: number
    +minIntervalMs: number
  }
  class RateLimiterStats {
    <<interface>>
    +trackedModels: number
    +blockedModels: string
    +avgAvailableTokens: number
    +lowCapacityModels: string
  }
  class TokenBucketRateLimiter {
    <<interface>>
  }
```

## 関数

### getTokenBucketRateLimiter

```typescript
getTokenBucketRateLimiter(): TokenBucketRateLimiterImpl
```

シングルトンのレートリミッターを取得する。

**戻り値**: `TokenBucketRateLimiterImpl`

### createTokenBucketRateLimiter

```typescript
createTokenBucketRateLimiter(): TokenBucketRateLimiterImpl
```

新しいレート制限インスタンスを作成（テスト用）

**戻り値**: `TokenBucketRateLimiterImpl`

### resetTokenBucketRateLimiter

```typescript
resetTokenBucketRateLimiter(): void
```

シングルトンのレートリミッターをリセット

**戻り値**: `void`

## クラス

### TokenBucketRateLimiterImpl

Token bucket rate limiter with RPM support and burst tolerance.

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| buckets | `Map<string, TokenBucketState>` | private |
| configs | `Map<string, RateLimitConfig>` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| canProceed | `canProceed(provider, model, tokensNeeded): number` |
| consume | `consume(provider, model, tokens): void` |
| record429 | `record429(provider, model, retryAfterMs): void` |
| recordSuccess | `recordSuccess(provider, model): void` |
| getStats | `getStats(): RateLimiterStats` |
| configure | `configure(provider, model, config): void` |
| reset | `reset(provider, model): void` |
| resetAll | `resetAll(): void` |
| getBucketState | `getBucketState(provider, model): TokenBucketState | undefined` |
| getKey | `getKey(provider, model): string` |
| getConfig | `getConfig(provider, model): RateLimitConfig` |
| getOrCreateState | `getOrCreateState(key, provider, model): TokenBucketState` |
| refillTokens | `refillTokens(state): void` |

## インターフェース

### TokenBucketState

```typescript
interface TokenBucketState {
  tokens: number;
  maxTokens: number;
  refillRate: number;
  lastRefillMs: number;
  retryAfterMs: number;
  burstMultiplier: number;
  burstTokensUsed: number;
}
```

Token bucket state for a provider/model combination.

### RateLimitConfig

```typescript
interface RateLimitConfig {
  rpm: number;
  burstMultiplier: number;
  minIntervalMs: number;
}
```

レート制限の設定

### RateLimiterStats

```typescript
interface RateLimiterStats {
  trackedModels: number;
  blockedModels: string[];
  avgAvailableTokens: number;
  lowCapacityModels: string[];
}
```

レートリミッターの統計情報

### TokenBucketRateLimiter

```typescript
interface TokenBucketRateLimiter {
  canProceed(provider, model, tokensNeeded);
  consume(provider, model, tokens);
  record429(provider, model, retryAfterMs);
  recordSuccess(provider, model);
  getStats();
}
```

トークンバケット方式のレート制限インターフェース

---
*自動生成: 2026-02-18T14:31:31.041Z*
