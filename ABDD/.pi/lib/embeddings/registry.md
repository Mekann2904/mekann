---
title: registry
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# registry

## 概要

`registry` モジュールのAPIリファレンス。

## インポート

```typescript
import { existsSync, readFileSync, writeFileSync... } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { EmbeddingProvider, ProviderConfig, EmbeddingModuleConfig... } from './types.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getEmbeddingProvider` | デフォルトプロバイダーを取得 |
| 関数 | `generateEmbedding` | エンベディングを生成（デフォルトプロバイダー使用） |
| 関数 | `generateEmbeddingsBatch` | バッチエンベディングを生成（デフォルトプロバイダー使用） |
| クラス | `EmbeddingProviderRegistry` | プロバイダーレジストリ |

## 図解

### クラス図

```mermaid
classDiagram
  class EmbeddingProviderRegistry {
    -providers: any
    -config: EmbeddingModuleConfig
    +register
    +unregister
    +get
    +getAll
    +getAvailable
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[registry]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types_js["types.js"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  getEmbeddingProvider["getEmbeddingProvider()"]
  generateEmbedding["generateEmbedding()"]
  generateEmbeddingsBatch["generateEmbeddingsBatch()"]
  getEmbeddingProvider -.-> generateEmbedding
  generateEmbedding -.-> generateEmbeddingsBatch
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant registry as "registry"
  participant types_js as "types.js"

  Caller->>registry: getEmbeddingProvider()
  activate registry
  Note over registry: 非同期処理開始
  registry->>types_js: 内部関数呼び出し
  types_js-->>registry: 結果
  deactivate registry
  registry-->>Caller: Promise<EmbeddingProvider | null>

  Caller->>registry: generateEmbedding()
  activate registry
  registry-->>Caller: Promise<number[] | null>
  deactivate registry
```

## 関数

### getEmbeddingProvider

```typescript
async getEmbeddingProvider(config?: ProviderConfig): Promise<EmbeddingProvider | null>
```

デフォルトプロバイダーを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| config | `ProviderConfig` | いいえ |

**戻り値**: `Promise<EmbeddingProvider | null>`

### generateEmbedding

```typescript
async generateEmbedding(text: string, config?: ProviderConfig): Promise<number[] | null>
```

エンベディングを生成（デフォルトプロバイダー使用）

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

バッチエンベディングを生成（デフォルトプロバイダー使用）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| texts | `string[]` | はい |
| config | `ProviderConfig` | いいえ |

**戻り値**: `Promise<(number[] | null)[]>`

## クラス

### EmbeddingProviderRegistry

プロバイダーレジストリ

責務:
- プロバイダーの登録・検索
- 設定に基づくプロバイダー選択
- デフォルトプロバイダー管理

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
*自動生成: 2026-02-17T22:24:18.934Z*
