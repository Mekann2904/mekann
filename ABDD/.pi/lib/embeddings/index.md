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
// from './registry.js': embeddingRegistry
// from './providers/openai.js': openAIEmbeddingProvider
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `initializeEmbeddingModule` | - |
| 関数 | `initializeEmbeddingModuleSync` | - |

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

**戻り値**: `Promise<void>`

### initializeEmbeddingModuleSync

```typescript
initializeEmbeddingModuleSync(): void
```

**戻り値**: `void`

---
*自動生成: 2026-02-18T18:06:17.522Z*
