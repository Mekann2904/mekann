---
title: types
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# types

## 概要

`types` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| インターフェース | `ProviderCapabilities` | - |
| インターフェース | `EmbeddingProvider` | エンベディングプロバイダーインターフェース |
| インターフェース | `ProviderConfig` | プロバイダー設定を定義 |
| インターフェース | `EmbeddingModuleConfig` | - |
| インターフェース | `EmbeddingResult` | - |
| インターフェース | `ProviderStatus` | - |
| インターフェース | `VectorSearchResult` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class ProviderCapabilities {
    <<interface>>
    +maxTokens: number
    +dimensions: number
    +supportsBatch: boolean
    +maxBatchSize: number
    +offlineCapable: boolean
  }
  class EmbeddingProvider {
    <<interface>>
    +id: string
    +name: string
    +model: string
    +capabilities: ProviderCapabilities
  }
  class ProviderConfig {
    <<interface>>
    +provider: string
    +options: Record_string_unknow
  }
  class EmbeddingModuleConfig {
    <<interface>>
    +version: number
    +defaultProvider: string_null
    +fallbackOrder: string
    +providerOptions: Record_string_Record
  }
  class EmbeddingResult {
    <<interface>>
    +embedding: number
    +provider: string
    +model: string
    +dimensions: number
    +tokens: number
  }
  class ProviderStatus {
    <<interface>>
    +id: string
    +name: string
    +model: string
    +available: boolean
    +unavailableReason: string
  }
  class VectorSearchResult {
    <<interface>>
    +item: T
    +similarity: number
  }
```

## インターフェース

### ProviderCapabilities

```typescript
interface ProviderCapabilities {
  maxTokens: number;
  dimensions: number;
  supportsBatch: boolean;
  maxBatchSize: number;
  offlineCapable: boolean;
}
```

### EmbeddingProvider

```typescript
interface EmbeddingProvider {
  id: string;
  name: string;
  model: string;
  capabilities: ProviderCapabilities;
  isAvailable();
  generateEmbedding(text);
  generateEmbeddingsBatch(texts);
  initialize();
  dispose();
}
```

エンベディングプロバイダーインターフェース

### ProviderConfig

```typescript
interface ProviderConfig {
  provider?: string;
  options?: Record<string, unknown>;
}
```

プロバイダー設定を定義

### EmbeddingModuleConfig

```typescript
interface EmbeddingModuleConfig {
  version: number;
  defaultProvider: string | null;
  fallbackOrder: string[];
  providerOptions?: Record<string, Record<string, unknown>>;
}
```

### EmbeddingResult

```typescript
interface EmbeddingResult {
  embedding: number[];
  provider: string;
  model: string;
  dimensions: number;
  tokens?: number;
}
```

### ProviderStatus

```typescript
interface ProviderStatus {
  id: string;
  name: string;
  model: string;
  available: boolean;
  unavailableReason?: string;
  capabilities: ProviderCapabilities;
}
```

### VectorSearchResult

```typescript
interface VectorSearchResult {
  item: T;
  similarity: number;
}
```

---
*自動生成: 2026-02-24T17:08:02.672Z*
