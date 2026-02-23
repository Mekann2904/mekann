---
title: openai
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# openai

## 概要

`openai` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': existsSync, readFileSync
// from 'node:path': join
// from 'node:os': homedir
// from '../types.js': EmbeddingProvider, ProviderCapabilities
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getOpenAIKey` | OpenAI APIキーを取得 |
| クラス | `OpenAIEmbeddingProvider` | OpenAI埋め込みプロバイダ |

## 図解

### クラス図

```mermaid
classDiagram
  class OpenAIEmbeddingProvider {
    +id: any
    +name: any
    +model: any
    +capabilities: ProviderCapabilities
    +isAvailable()
    +generateEmbedding()
    +generateEmbeddingsBatch()
  }
  class AuthConfig {
    <<interface>>
  }
  class OpenAIEmbeddingResponse {
    <<interface>>
    +data: Array_embedding_num
    +model: string
    +object: string
    +usage: prompt_tokens_numbe
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[openai]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types["types"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  getOpenAIKey["getOpenAIKey()"]
  loadAuthConfig["loadAuthConfig()"]
  resolveKeyValue["resolveKeyValue()"]
  getOpenAIKey --> loadAuthConfig
  getOpenAIKey --> resolveKeyValue
```

## 関数

### resolveKeyValue

```typescript
resolveKeyValue(key: string): string | null
```

Resolve a key value that may be a literal or env var reference.
This follows pi's official key resolution method.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| key | `string` | はい |

**戻り値**: `string | null`

### loadAuthConfig

```typescript
loadAuthConfig(): AuthConfig
```

Load auth configuration from auth.json.

**戻り値**: `AuthConfig`

### getOpenAIKey

```typescript
getOpenAIKey(): string | null
```

OpenAI APIキーを取得

**戻り値**: `string | null`

## クラス

### OpenAIEmbeddingProvider

OpenAI埋め込みプロバイダ

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| id | `any` | public |
| name | `any` | public |
| model | `any` | public |
| capabilities | `ProviderCapabilities` | public |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| isAvailable | `isAvailable(): Promise<boolean>` |
| generateEmbedding | `generateEmbedding(text): Promise<number[] | null>` |
| generateEmbeddingsBatch | `generateEmbeddingsBatch(texts): Promise<(number[] | null)[]>` |

## インターフェース

### AuthConfig

```typescript
interface AuthConfig {
}
```

### OpenAIEmbeddingResponse

```typescript
interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
    object: string;
  }>;
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
```

---
*自動生成: 2026-02-23T06:29:42.321Z*
