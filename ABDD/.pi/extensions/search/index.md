---
title: index
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# index

## 概要

`index` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '@sinclair/typebox': Type
// from '@mariozechner/pi-ai': StringEnum
// from './tools/file_candidates.js': fileCandidates
// from './tools/code_search.js': codeSearch
// ... and 8 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### file_candidates

Enumerate files and directories using fd with fast glob and extension filtering. Returns up to 100 results by default.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Judge as "Judge"

  User->>System: Enumerate files and directories using fd with fast glob a...
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Storage: 候補ファイル一覧取得
  Storage->>Internal: グローバルキャッシュインスタンスを取得する。
  Storage->>Internal: 検索履歴取得
  Storage->>Internal: キャッシュキーを生成する
  Internal->>Unresolved: Object.keys(params).sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.keys (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: keyParts.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Array.isArray (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: value.sort().join (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: sortObjectKeys
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Unresolved: cache.getCached (.pi/extensions/search/utils/cache.ts)
  Storage->>Unresolved: history.addHistoryEntry (.pi/extensions/search/utils/history.ts)
  Storage->>Internal: ツールのパラメータからクエリ文字列を抽出する
  Storage->>Internal: extractResultPaths
  Storage->>Judge: ツール利用可否を確認
  Judge->>Unresolved: Promise.all (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Judge->>Internal: isAvailable
  Judge->>Internal: execute
  Judge->>Unresolved: ctagsHelp.stdout.includes (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Storage->>Internal: useFdCommand
  Storage->>Internal: nativeFileCandidates
  Storage->>Internal: エラーカテゴリを判定
  Storage->>Internal: エラーメッセージ取得
  Storage->>Internal: エラーレスポンス作成
  Storage->>Unresolved: toolError.format (.pi/extensions/search/utils/errors.ts)
  Storage->>Internal: シンプルヒント作成
  Internal->>Internal: calculateSimpleConfidence
  Internal->>Internal: getAlternativeTools
  Internal->>Internal: generateRelatedQueries
  Storage->>Unresolved: extractResultPaths(result.results).slice (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Unresolved: cache.setCache (.pi/extensions/search/utils/cache.ts)
  System->>Storage: 候補一覧を整形
  System-->>User: 結果

```

### code_search

Search code patterns using ripgrep (rg) with regex support. Returns matches with file, line, and context. Up to 50 results by default.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Judge as "Judge"

  User->>System: Search code patterns using ripgrep (rg) with regex suppor...
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Internal: コード検索
  Internal->>Internal: normalizeCodeSearchInput
  Internal->>Internal: パラメータエラー生成
  Internal->>Internal: グローバルキャッシュインスタンスを取得する。
  Internal->>Internal: 検索履歴取得
  Internal->>Internal: キャッシュキーを生成する
  Internal->>Unresolved: Object.keys(params).sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.keys (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: keyParts.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Array.isArray (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: value.sort().join (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: sortObjectKeys
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: cache.getCached (.pi/extensions/search/utils/cache.ts)
  Internal->>Unresolved: history.addHistoryEntry (.pi/extensions/search/utils/history.ts)
  Internal->>Internal: ツールのパラメータからクエリ文字列を抽出する
  Internal->>Internal: extractResultPaths
  Internal->>Judge: ツール利用可否を確認
  Judge->>Unresolved: Promise.all (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Judge->>Internal: isAvailable
  Judge->>Internal: execute
  Judge->>Unresolved: ctagsHelp.stdout.includes (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Internal: useRgCommand
  Internal->>Internal: nativeCodeSearch
  Internal->>Internal: エラーカテゴリを判定
  Internal->>Internal: エラーメッセージ取得
  Internal->>Internal: エラー作成
  Internal->>Unresolved: toolError.format (.pi/extensions/search/utils/errors.ts)
  Internal->>Internal: シンプルヒント作成
  Internal->>Internal: calculateSimpleConfidence
  Internal->>Internal: getAlternativeTools
  Internal->>Internal: generateRelatedQueries
  Internal->>Unresolved: extractResultPaths(result.results).slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: cache.setCache (.pi/extensions/search/utils/cache.ts)
  System->>Internal: 検索結果を整形
  System-->>User: 結果

```

### sym_index

Generate a symbol index using ctags. Creates a JSONL file with function, class, and variable definitions.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Judge as "Judge"

  User->>System: Generate a symbol index using ctags. Creates a JSONL file...
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Internal: インデックスを作成
  Internal->>Judge: ツール利用可否を確認
  Judge->>Unresolved: Promise.all (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Judge->>Internal: isAvailable
  Judge->>Internal: execute
  Judge->>Unresolved: ctagsHelp.stdout.includes (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Internal: 依存関係エラー生成
  Internal->>Internal: getInstallHint
  Internal->>Internal: getLegacyIndexPath
  Internal->>Internal: getLegacyMetaPath
  Internal->>Internal: fileExists
  Internal->>Internal: isIndexStale
  Internal->>Internal: readLegacyIndex
  Internal->>Internal: incrementalUpdate
  Internal->>Internal: writeLegacyIndex
  Internal->>Internal: writeLegacyMeta
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: writeShardedIndex
  Internal->>Internal: updateManifest
  Internal->>Internal: writeMeta
  Internal->>Internal: getMetaPath
  Internal->>Internal: getSourceFiles
  Internal->>Internal: useCtagsCommand
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: 実行エラー生成
  System-->>User: 結果

```

### sym_find

Search for symbol definitions (functions, classes, variables) from the ctags index. Supports pattern matching on name and filtering by kind.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"
  participant Judge as "Judge"
  participant Executor as "Executor"

  User->>System: Search for symbol definitions (functions, classes, variab...
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Internal: シンボル検索実行
  Internal->>Internal: グローバルキャッシュインスタンスを取得する。
  Internal->>Internal: 検索履歴取得
  Internal->>Internal: キャッシュキーを生成する
  Internal->>Unresolved: Object.keys(params).sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.keys (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: keyParts.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Array.isArray (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: value.sort().join (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: sortObjectKeys
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: cache.getCached (.pi/extensions/search/utils/cache.ts)
  Internal->>Unresolved: history.addHistoryEntry (.pi/extensions/search/utils/history.ts)
  Internal->>Internal: ツールのパラメータからクエリ文字列を抽出する
  Internal->>Internal: extractResultPaths
  Internal->>Storage: インデックス読込
  Storage->>Internal: getShardDir
  Storage->>Internal: fileExists
  Storage->>Internal: readAllShards
  Storage->>Internal: getLegacyIndexPath
  Storage->>Internal: readLegacyIndex
  Internal->>Internal: インデックスを作成
  Internal->>Judge: ツール利用可否を確認
  Judge->>Unresolved: Promise.all (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Judge->>Internal: isAvailable
  Judge->>Internal: execute
  Judge->>Unresolved: ctagsHelp.stdout.includes (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Internal: 依存関係エラー生成
  Internal->>Internal: getInstallHint
  Internal->>Internal: getLegacyMetaPath
  Internal->>Internal: isIndexStale
  Internal->>Internal: incrementalUpdate
  Internal->>Internal: writeLegacyIndex
  Internal->>Internal: writeLegacyMeta
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: writeShardedIndex
  Internal->>Internal: updateManifest
  Internal->>Internal: writeMeta
  Internal->>Internal: getMetaPath
  Internal->>Internal: getSourceFiles
  Internal->>Internal: useCtagsCommand
  Internal->>Internal: 実行エラー生成
  Internal->>Internal: FSエラーを生成
  Internal->>Internal: エラーカテゴリを判定
  Internal->>Internal: エラーメッセージ取得
  Internal->>Internal: エラーレスポンス作成
  Internal->>Unresolved: toolError.format (.pi/extensions/search/utils/errors.ts)
  Internal->>Internal: filterSymbols
  Internal->>Internal: sortSymbols
  Internal->>Executor: 結果を切り詰める
  Executor->>Unresolved: results.slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: シンプルヒント作成
  Internal->>Internal: calculateSimpleConfidence
  Internal->>Internal: getAlternativeTools
  Internal->>Internal: generateRelatedQueries
  Internal->>Unresolved: cache.setCache (.pi/extensions/search/utils/cache.ts)
  System->>Internal: シンボルフォーマット
  Internal->>Unresolved: byKind.get (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: byKind.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  System-->>User: 結果

```

### call_graph_index

Generate a call graph index showing function call relationships. Uses ctags and ripgrep for analysis.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"
  participant Judge as "Judge"

  User->>System: Generate a call graph index showing function call relatio...
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Internal: 呼び出しグラフ索引付け
  Internal->>Storage: インデックス読込
  Storage->>Internal: getShardDir
  Storage->>Internal: fileExists
  Storage->>Internal: readAllShards
  Storage->>Internal: getLegacyIndexPath
  Storage->>Internal: readLegacyIndex
  Internal->>Internal: インデックスを作成
  Internal->>Judge: ツール利用可否を確認
  Judge->>Unresolved: Promise.all (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Judge->>Internal: isAvailable
  Judge->>Internal: execute
  Judge->>Unresolved: ctagsHelp.stdout.includes (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Internal: 依存関係エラー生成
  Internal->>Internal: getInstallHint
  Internal->>Internal: getLegacyMetaPath
  Internal->>Internal: isIndexStale
  Internal->>Internal: incrementalUpdate
  Internal->>Internal: writeLegacyIndex
  Internal->>Internal: writeLegacyMeta
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: writeShardedIndex
  Internal->>Internal: updateManifest
  Internal->>Internal: writeMeta
  Internal->>Internal: getMetaPath
  Internal->>Internal: getSourceFiles
  Internal->>Internal: useCtagsCommand
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: 実行エラー生成
  Internal->>Internal: インデックス期限確認
  Internal->>Internal: readCallGraphIndex
  Internal->>Unresolved: import('../tools/sym_index.js') 		.then((m) => m.getIndexMetadata(cwd)) 		.catch (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: import('../tools/sym_index.js') 		.then (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: メタデータ取得
  Internal->>Internal: readMeta
  Internal->>Internal: コールグラフ構築
  Internal->>Internal: getFunctionDefinitions
  Internal->>Unresolved: definitions.map (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: generateNodeId
  Internal->>Unresolved: definitionMap.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: definitionByFile.get (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: fileDefs.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: fileDefs.sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: sortedDefs.findIndex (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Internal: findCallsInFile
  Internal->>Internal: calculateConfidence
  Internal->>Storage: インデックス保存
  Storage->>Internal: getCallGraphIndexPath
  Storage->>Internal: dirname
  Storage->>Internal: mkdir
  Storage->>Storage: writeFile
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: インデックスをフォーマット
  Internal->>Unresolved: [ 		`Call Graph Index Generated`, 		`  Nodes (functions): ${result.nodeCount}`, 		`  Edges (calls): ${result.edgeCount}`, 		`  Output: ${result.outputPath}`, 	].join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### find_callers

Find all functions that call the specified symbol. Supports depth-based traversal to find indirect callers.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"

  User->>System: Find all functions that call the specified symbol. Suppor...
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Internal: 呼び出し元検索
  Internal->>Storage: インデックス読込
  Storage->>Internal: getCallGraphIndexPath
  Storage->>Internal: fileExists
  Storage->>Storage: readFile
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: インデックス期限確認
  Internal->>Unresolved: import('../tools/sym_index.js') 		.then((m) => m.getIndexMetadata(cwd)) 		.catch (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: import('../tools/sym_index.js') 		.then (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: メタデータ取得
  Internal->>Internal: getMetaPath
  Internal->>Internal: readMeta
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: callGraphIndex
  Internal->>Internal: 指定されたシンボルを呼び出す全ての関数を検索します。
  Internal->>Unresolved: queue.shift (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: index.edges.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: edge.callee.toLowerCase (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: findNodeById
  Internal->>Unresolved: results.get (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: results.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: queue.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Array.from (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: results.values (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Internal->>Unresolved: sorted.sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: sorted.slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: 呼び出し元を整形
  Internal->>Unresolved: '  '.repeat (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: (confidence * 100).toFixed (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### find_callees

Find all functions called by the specified symbol. Supports depth-based traversal to find indirect callees.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"

  User->>System: Find all functions called by the specified symbol. Suppor...
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Internal: 指定されたシンボルが呼び出す関数を検索
  Internal->>Storage: インデックス読込
  Storage->>Internal: getCallGraphIndexPath
  Storage->>Internal: fileExists
  Storage->>Storage: readFile
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: インデックス期限確認
  Internal->>Unresolved: import('../tools/sym_index.js') 		.then((m) => m.getIndexMetadata(cwd)) 		.catch (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: import('../tools/sym_index.js') 		.then (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: メタデータ取得
  Internal->>Internal: getMetaPath
  Internal->>Internal: readMeta
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: callGraphIndex
  Internal->>Internal: 指定されたシンボルから呼ばれる関数を検索する
  Internal->>Internal: findNodesByName
  Internal->>Unresolved: queue.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: queue.shift (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: index.edges.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: results.get (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: results.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: results.has (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: Array.from (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: results.values (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Internal->>Unresolved: sorted.sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: sorted.slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: 呼び出し先の検索結果をフォーマットする
  Internal->>Unresolved: '  '.repeat (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: (confidence * 100).toFixed (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### semantic_index

Generate a semantic index of code files using vector embeddings. Enables semantic code search with natural language queries. Requires OpenAI API key.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"

  User->>System: Generate a semantic index of code files using vector embe...
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Internal: 意味的索引作成
  Internal->>Internal: existsSync
  Internal->>Internal: getIndexPath
  Internal->>Internal: getMetaPath
  Internal->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Storage: readFileSync
  Internal->>Unresolved: embeddingRegistry.getAvailable (.pi/lib/embeddings/registry.ts)
  Internal->>Unresolved: console.log (node_modules/typescript/lib/lib.dom.d.ts)
  Internal->>Internal: collectFiles
  Internal->>Internal: relative
  Internal->>Unresolved: console.warn (node_modules/typescript/lib/lib.dom.d.ts)
  Internal->>Internal: chunkCode
  Internal->>Internal: buildChunkText
  Internal->>Unresolved: embeddingRegistry.getDefault (.pi/lib/embeddings/registry.ts)
  Internal->>Unresolved: embeddings.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: saveIndex
  Internal->>Internal: saveMetadata
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: console.error (node_modules/typescript/lib/lib.dom.d.ts)
  System-->>User: 結果

```

### semantic_search

Search code using natural language queries with semantic understanding. Requires a pre-built semantic index (run semantic_index first). Returns code chunks ranked by similarity.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Search code using natural language queries with semantic ...
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Unresolved: params.query.trim (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: 意味的検索実行
  Internal->>Internal: loadIndex
  Internal->>Unresolved: filteredIndex.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: e.metadata.language.toLowerCase (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: kind.includes (node_modules/typescript/lib/lib.es2016.array.include.d.ts)
  Internal->>Internal: findNearestNeighbors
  Internal->>Unresolved: nearest.map (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: console.error (node_modules/typescript/lib/lib.dom.d.ts)
  System->>Internal: 検索結果整形
  Internal->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: (item.similarity * 100).toFixed (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: item.code.split('\n').slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: item.code.split (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[index]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    file_candidates["file_candidates"]
    code_search["code_search"]
    sym_index["sym_index"]
    sym_find["sym_find"]
    call_graph["call_graph"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _sinclair["@sinclair"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

---
*自動生成: 2026-02-23T06:29:42.127Z*
