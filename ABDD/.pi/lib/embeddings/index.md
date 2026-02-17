---
title: index
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# index

## 概要

`index` モジュールのAPIリファレンス。

## インポート

```typescript
import { embeddingRegistry } from './registry.js';
import { openAIEmbeddingProvider } from './providers/openai.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `initializeEmbeddingModule` | Initialize the embedding module with default provi |
| 関数 | `initializeEmbeddingModuleSync` | Synchronous initialization for non-async contexts. |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[index]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    registry_js[registry.js]
    openai_js[openai.js]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  initializeEmbeddingModule["initializeEmbeddingModule()"]
  initializeEmbeddingModuleSync["initializeEmbeddingModuleSync()"]
  initializeEmbeddingModule -.-> initializeEmbeddingModuleSync
```

## 関数

### initializeEmbeddingModule

```typescript
async initializeEmbeddingModule(): Promise<void>
```

Initialize the embedding module with default providers.
Registers OpenAI provider.

**戻り値**: `Promise<void>`

### initializeEmbeddingModuleSync

```typescript
initializeEmbeddingModuleSync(): void
```

Synchronous initialization for non-async contexts.

**戻り値**: `void`

---
*自動生成: 2026-02-17T21:48:27.703Z*
