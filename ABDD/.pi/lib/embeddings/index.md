---
title: index
category: api-reference
audience: developer
last_updated: 2026-02-18
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
| 関数 | `initializeEmbeddingModule` | デフォルトプロバイダで埋め込みモジュールを初期化 |
| 関数 | `initializeEmbeddingModuleSync` | 非同期コンテキスト用の同期初期化 |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[index]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    registry["registry"]
    openai["openai"]
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

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant index as "index"
  participant registry as "registry"
  participant openai as "openai"

  Caller->>index: initializeEmbeddingModule()
  activate index
  Note over index: 非同期処理開始
  index->>registry: 内部関数呼び出し
  registry-->>index: 結果
  deactivate index
  index-->>Caller: Promise_void

  Caller->>index: initializeEmbeddingModuleSync()
  index-->>Caller: void
```

## 関数

### initializeEmbeddingModule

```typescript
async initializeEmbeddingModule(): Promise<void>
```

デフォルトプロバイダで埋め込みモジュールを初期化

**戻り値**: `Promise<void>`

### initializeEmbeddingModuleSync

```typescript
initializeEmbeddingModuleSync(): void
```

非同期コンテキスト用の同期初期化

**戻り値**: `void`

---
*自動生成: 2026-02-18T07:48:44.952Z*
