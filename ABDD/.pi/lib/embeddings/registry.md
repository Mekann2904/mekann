---
title: registry
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# registry

## 概要

`registry` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': existsSync, readFileSync, writeFileSync, ...
// from 'node:path': join
// from 'node:os': homedir
// from './types.js': EmbeddingProvider, ProviderConfig, EmbeddingModuleConfig, ...
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getEmbeddingProvider` | プロバイダを取得 |
| 関数 | `generateEmbedding` | ベクトルを生成 |
| 関数 | `generateEmbeddingsBatch` | 埋め込みベクトルを一括生成 |
| クラス | `EmbeddingProviderRegistry` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class EmbeddingProviderRegistry {
    -providers: any
    -config: EmbeddingModuleConfi
    +register()
    +unregister()
    +get()
    +getAll()
    +getAvailable()
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[registry]
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
  generateEmbedding["generateEmbedding()"]
  generateEmbeddingsBatch["generateEmbeddingsBatch()"]
  getEmbeddingProvider["getEmbeddingProvider()"]
  generateEmbedding --> generateEmbedding
  generateEmbedding --> getEmbeddingProvider
  generateEmbeddingsBatch --> generateEmbeddingsBatch
  generateEmbeddingsBatch --> getEmbeddingProvider
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant registry as "registry"
  participant types as "types"

  Caller->>registry: getEmbeddingProvider()
  activate registry
  Note over registry: 非同期処理開始
  registry->>types: 内部関数呼び出し
  types-->>registry: 結果
  deactivate registry
  registry-->>Caller: Promise_EmbeddingPro

  Caller->>registry: generateEmbedding()
  activate registry
  registry-->>Caller: Promise_number_nul
  deactivate registry
```

## 関数

### getEmbeddingProvider

```typescript
async getEmbeddingProvider(config?: ProviderConfig): Promise<EmbeddingProvider | null>
```

プロバイダを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| config | `ProviderConfig` | いいえ |

**戻り値**: `Promise<EmbeddingProvider | null>`

### generateEmbedding

```typescript
async generateEmbedding(text: string, config?: ProviderConfig): Promise<number[] | null>
```

ベクトルを生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| config | `ProviderConfig` | いいえ |

**戻り値**: `Promise<number[] | null>`

### generateEmbeddingsBatch

```typescript
async generateEmbeddingsBatch(texts: string[], config?: ProviderConfig): Promise<(number[] | null)[]>
```

埋め込みベクトルを一括生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| texts | `string[]` | はい |
| config | `ProviderConfig` | いいえ |

**戻り値**: `Promise<(number[] | null)[]>`

## クラス

### EmbeddingProviderRegistry

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| providers | `any` | private |
| config | `EmbeddingModuleConfig` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| register | `register(provider): void` |
| unregister | `unregister(providerId): void` |
| get | `get(providerId): EmbeddingProvider | undefined` |
| getAll | `getAll(): EmbeddingProvider[]` |
| getAvailable | `getAvailable(): Promise<EmbeddingProvider[]>` |
| getAllStatus | `getAllStatus(): Promise<ProviderStatus[]>` |
| setDefault | `setDefault(providerId): void` |
| getDefaultProviderId | `getDefaultProviderId(): string | null` |
| getDefault | `getDefault(): Promise<EmbeddingProvider | null>` |
| resolve | `resolve(config): Promise<EmbeddingProvider | null>` |
| getConfigPath | `getConfigPath(): string` |
| getConfig | `getConfig(): EmbeddingModuleConfig` |
| updateConfig | `updateConfig(updates): void` |
| loadConfig | `loadConfig(): EmbeddingModuleConfig` |
| saveConfig | `saveConfig(): void` |

---
*自動生成: 2026-02-18T18:06:17.524Z*
