---
title: Token Bucket
category: reference
audience: developer
last_updated: 2026-02-18
tags: [rate-limiting, token-bucket, rpm]
related: [task-scheduler, adaptive-rate-controller]
---

# Token Bucket

プロバイダ/モデル固有の制限を持つトークンバケットレートリミッター。

## 概要

LLM APIコール用のRPMベースレートリミッティングとバースト許容を可能にする。

## Types

### RateLimitConfig

プロバイダ/モデルのレート制限設定。

```typescript
interface RateLimitConfig {
  /** 1分あたりのリクエスト数 */
  rpm: number;
  /** バースト許容量（ベースレートの倍率） */
  burstMultiplier: number;
  /** リクエスト間の最小待機時間（ms） */
  minIntervalMs: number;
}
```

### RateLimiterStats

レートリミッター統計。

```typescript
interface RateLimiterStats {
  /** 追跡中のプロバイダ/モデル組み合わせ数 */
  trackedModels: number;
  /** 429でブロック中のモデル */
  blockedModels: string[];
  /** 全モデルの平均利用可能トークン数 */
  avgAvailableTokens: number;
  /** 低容量（<20%）のモデル */
  lowCapacityModels: string[];
}
```

### TokenBucketRateLimiter Interface

トークンバケットレートリミッターインターフェース。

```typescript
interface TokenBucketRateLimiter {
  /** リクエスト可能かチェック。待機時間(ms)または0を返す */
  canProceed(provider: string, model: string, tokensNeeded: number): number;

  /** バケットからトークンを消費 */
  consume(provider: string, model: string, tokens: number): void;

  /** 429エラーを記録してレートリミッティングを調整 */
  record429(provider: string, model: string, retryAfterMs?: number): void;

  /** 成功したリクエストを記録 */
  recordSuccess(provider: string, model: string): void;

  /** 現在の統計を取得 */
  getStats(): RateLimiterStats;
}
```

## TokenBucketRateLimiterImpl Class

RPMサポートとバースト許容を持つトークンバケットレートリミッター。

### Constructor

デフォルト設定で初期化。

### Methods

#### canProceed()

リクエストを継続できるかチェック。

```typescript
canProceed(provider: string, model: string, tokensNeeded: number): number
```

**戻り値:** 待機時間（ms）、または即時実行可能な場合は0

#### consume()

バケットからトークンを消費。

```typescript
consume(provider: string, model: string, tokens: number): void
```

#### record429()

429エラーを記録してレートリミッティングを調整。

- retry-after時間を設定
- バースト容量を一時的に削減
- 一部トークンをドレイン（ペナルティ）
- 補充レートをわずかに削減

```typescript
record429(provider: string, model: string, retryAfterMs?: number): void
```

#### recordSuccess()

成功したリクエストを記録。バースト容量と補充レートを徐々に回復。

```typescript
recordSuccess(provider: string, model: string): void
```

#### getStats()

現在の統計を取得。

```typescript
getStats(): RateLimiterStats
```

#### configure()

特定のプロバイダ/モデルのレート制限を設定。

```typescript
configure(provider: string, model: string, config: Partial<RateLimitConfig>): void
```

#### reset()

特定のバケットをリセット。

```typescript
reset(provider: string, model: string): void
```

#### resetAll()

全バケットをリセット。

```typescript
resetAll(): void
```

#### getBucketState()

デバッグ用のバケット状態を取得。

```typescript
getBucketState(provider: string, model: string): TokenBucketState | undefined
```

## Default Configurations

### プロバイダ別デフォルト設定

| プロバイダ:モデル | RPM | バースト倍率 | 最小間隔 |
|-----------------|-----|------------|---------|
| anthropic:default | 60 | 2.0 | 100ms |
| anthropic:claude-3-5-sonnet | 60 | 1.5 | 100ms |
| anthropic:claude-3-5-haiku | 100 | 2.0 | 50ms |
| anthropic:claude-sonnet-4 | 60 | 1.5 | 100ms |
| anthropic:claude-opus-4 | 30 | 1.2 | 200ms |
| openai:default | 500 | 2.0 | 50ms |
| openai:gpt-4o | 500 | 1.5 | 50ms |
| openai:gpt-4-turbo | 500 | 1.5 | 50ms |
| openai:gpt-3.5-turbo | 3500 | 2.0 | 20ms |
| google:default | 60 | 2.0 | 100ms |
| google:gemini-pro | 60 | 2.0 | 100ms |
| google:gemini-1.5-pro | 30 | 1.5 | 200ms |

## Factory Functions

### getTokenBucketRateLimiter()

シングルトンレートリミッターインスタンスを取得。

```typescript
function getTokenBucketRateLimiter(): TokenBucketRateLimiterImpl
```

### createTokenBucketRateLimiter()

新しいレートリミッターを作成（テスト用）。

```typescript
function createTokenBucketRateLimiter(): TokenBucketRateLimiterImpl
```

### resetTokenBucketRateLimiter()

シングルトンレートリミッターをリセット（テスト用）。

```typescript
function resetTokenBucketRateLimiter(): void
```

## Constants

- `MIN_TOKENS` = 1
- `MAX_TOKENS` = 10000
- `DEFAULT_429_RETRY_MS` = 60000 (1分)
- `MAX_429_RETRY_MS` = 600000 (10分)
- `BURST_COOLDOWN_MS` = 60000 (1分)

## 使用例

```typescript
const limiter = getTokenBucketRateLimiter();

// リクエスト可能かチェック
const waitMs = limiter.canProceed("anthropic", "claude-sonnet-4", 1);
if (waitMs > 0) {
  await sleep(waitMs);
}

// トークンを消費
limiter.consume("anthropic", "claude-sonnet-4", 1);

try {
  await makeApiCall();
  limiter.recordSuccess("anthropic", "claude-sonnet-4");
} catch (error) {
  if (error.status === 429) {
    limiter.record429("anthropic", "claude-sonnet-4", error.retryAfter * 1000);
  }
}

// 統計を取得
const stats = limiter.getStats();
console.log(`Blocked: ${stats.blockedModels.join(", ")}`);
```

## 関連ファイル

- `.pi/lib/task-scheduler.ts` - タスクスケジューラ
- `.pi/lib/adaptive-rate-controller.ts` - 適応レートコントローラ
