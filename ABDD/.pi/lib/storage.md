---
title: Storage モジュール
category: reference
audience: developer
last_updated: 2026-02-18
tags: [storage, memory, embeddings, semantic-search]
related: [storage-base, run-index, pattern-extraction, semantic-memory, embeddings]
---

# Storage モジュール

ストレージ、メモリ、埋め込み関連のユーティリティを集約するエクスポートモジュール。

## 概要

このモジュールは、Layer 2のストレージ関連機能を一箇所からインポートするための便利なエントリポイントを提供する。lib全体をインポートすることなく、必要な機能のみを取得できる。

## エクスポート構成

### Storage Base Utilities (Layer 2)

基礎的なストレージ操作:

- `HasId` - IDを持つエンティティの型
- `BaseRunRecord` - 基本的な実行記録の型
- `BaseStoragePaths` - ストレージパスの型
- `BaseStorage` - 基本ストレージインターフェース
- `createPathsFactory` - パスファクトリの作成
- `createEnsurePaths` - パス確認関数の作成
- `pruneRunArtifacts` - 古い実行アーティファクトの削除
- `mergeEntitiesById` - IDによるエンティティのマージ
- `mergeRunsById` - IDによる実行記録のマージ
- `resolveCurrentId` - 現在のIDの解決
- `resolveDefaultsVersion` - デフォルトバージョンの解決
- `createStorageLoader` - ストレージローダーの作成
- `createStorageSaver` - ストレージセーバーの作成
- `toId` - IDへの変換
- `mergeSubagentStorageWithDisk` - サブエージェントストレージとディスクのマージ
- `mergeTeamStorageWithDisk` - チームストレージとディスクのマージ

### Run Index Utilities (Layer 2)

ALMAインスパイアのメモリインデックス機能:

- `IndexedRun` - インデックス付き実行記録の型
- `TaskType` - タスク種別の型
- `RunIndex` - 実行インデックスの型
- `SearchOptions` - 検索オプションの型
- `SearchResult` - 検索結果の型
- `RUN_INDEX_VERSION` - インデックスバージョン定数
- `extractKeywords` - キーワード抽出
- `classifyTaskType` - タスク種別の分類
- `extractFiles` - ファイル抽出
- `indexSubagentRun` - サブエージェント実行のインデックス化
- `indexTeamRun` - チーム実行のインデックス化
- `buildRunIndex` - 実行インデックスの構築
- `getRunIndexPath` - インデックスパスの取得
- `loadRunIndex` - インデックスの読み込み
- `saveRunIndex` - インデックスの保存
- `getOrBuildRunIndex` - インデックスの取得または構築
- `searchRuns` - 実行記録の検索
- `findSimilarRuns` - 類似実行の検索
- `getRunsByType` - 種別による実行取得
- `getSuccessfulPatterns` - 成功パターンの取得

### Pattern Extraction Utilities (Layer 2)

実行履歴から再利用可能なパターンを抽出:

- `ExtractedPattern` - 抽出パターンの型
- `PatternExample` - パターン例の型
- `PatternStorage` - パターンストレージの型
- `RunData` - 実行データの型
- `PATTERN_STORAGE_VERSION` - パターンストレージバージョン
- `extractPatternFromRun` - 実行からのパターン抽出
- `getPatternStoragePath` - パターンストレージパスの取得
- `loadPatternStorage` - パターンストレージの読み込み
- `savePatternStorage` - パターンストレージの保存
- `addRunToPatterns` - 実行のパターンへの追加
- `extractAllPatterns` - 全パターンの抽出
- `getPatternsForTaskType` - タスク種別のパターン取得
- `getTopSuccessPatterns` - 成功パターンの上位取得
- `getFailurePatternsToAvoid` - 避けるべき失敗パターンの取得
- `findRelevantPatterns` - 関連パターンの検索

### Semantic Memory Utilities (Layer 2)

OpenAI Embeddingsベースのセマンティック検索:

- `RunEmbedding` - 実行埋め込みの型
- `SemanticMemoryStorage` - セマンティックメモリストレージの型
- `SemanticSearchResult` - セマンティック検索結果の型
- `SEMANTIC_MEMORY_VERSION` - バージョン定数
- `EMBEDDING_MODEL` - 埋め込みモデル定数
- `EMBEDDING_DIMENSIONS` - 埋め込み次元数
- `getSemanticMemoryPath` - パスの取得
- `loadSemanticMemory` - メモリの読み込み
- `saveSemanticMemory` - メモリの保存
- `buildSemanticMemoryIndex` - インデックスの構築
- `addRunToSemanticMemory` - 実行の追加
- `semanticSearch` - セマンティック検索
- `findSimilarRunsById` - IDによる類似実行検索
- `isSemanticMemoryAvailable` - 利用可能性の確認
- `getSemanticMemoryStats` - 統計の取得
- `clearSemanticMemory` - メモリのクリア

### Embeddings Module (Layer 2)

統一埋め込みプロバイダーインターフェース:

#### Types
- `EmbeddingProvider` - 埋め込みプロバイダーインターフェース
- `ProviderCapabilities` - プロバイダー機能
- `ProviderConfig` - プロバイダー設定
- `EmbeddingModuleConfig` - モジュール設定
- `EmbeddingResult` - 埋め込み結果
- `ProviderStatus` - プロバイダーステータス
- `VectorSearchResult` - ベクトル検索結果

#### Registry
- `EmbeddingProviderRegistry` - プロバイダーレジストリクラス
- `embeddingRegistry` - デフォルトレジストリインスタンス
- `getEmbeddingProvider` - プロバイダーの取得
- `generateEmbedding` - 単一埋め込み生成
- `generateEmbeddingsBatch` - バッチ埋め込み生成

#### Utilities
- `cosineSimilarity` - コサイン類似度計算
- `euclideanDistance` - ユークリッド距離計算
- `normalizeVector` - ベクトル正規化
- `findNearestNeighbors` - 最近傍探索
- `isValidEmbedding` - 埋め込みの妥当性検証

#### Providers
- `OpenAIEmbeddingProvider` - OpenAI埋め込みプロバイダー
- `openAIEmbeddingProvider` - デフォルトOpenAIプロバイダー
- `getOpenAIKey` - OpenAI APIキーの取得

#### Initialization
- `initializeEmbeddingModule` - モジュールの初期化

## 使用例

```typescript
// 基本的なストレージ操作
import { createStorageLoader, createStorageSaver } from "./lib/storage.js";

// 実行インデックスの検索
import { searchRuns, findSimilarRuns } from "./lib/storage.js";
const results = await searchRuns("authentication bug fix");

// セマンティック検索
import { semanticSearch, isSemanticMemoryAvailable } from "./lib/storage.js";
if (isSemanticMemoryAvailable()) {
  const similar = await semanticSearch("database connection error");
}

// パターンの活用
import { findRelevantPatterns, getTopSuccessPatterns } from "./lib/storage.js";
const patterns = findRelevantPatterns("bug-fix", "authentication");
```

## 関連ファイル

- `.pi/lib/storage-base.ts` - 基本ストレージ機能
- `.pi/lib/run-index.ts` - 実行インデックス
- `.pi/lib/pattern-extraction.ts` - パターン抽出
- `.pi/lib/semantic-memory.ts` - セマンティックメモリ
- `.pi/lib/embeddings/index.ts` - 埋め込みモジュール
