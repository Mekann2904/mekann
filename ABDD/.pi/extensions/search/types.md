---
title: types
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# types

## 概要

`types` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| インターフェース | `SearchHints` | 検索結果に対するエージェントへのヒント。 |
| インターフェース | `SearchDetails` | 検索結果の追加詳細 |
| インターフェース | `SearchResponse` | 検索ツールの基本レスポンス構造 |
| インターフェース | `SearchErrorResponse` | 検索エラーレスポンス |
| インターフェース | `FileCandidatesInput` | ファイル候補の検索入力オプション |
| インターフェース | `FileCandidate` | ファイルまたはディレクトリの候補 |
| インターフェース | `CodeSearchInput` | コード検索の入力パラメータ |
| インターフェース | `CodeSearchMatch` | コード検索のマッチ結果を表すインターフェース |
| インターフェース | `CodeSearchSummary` | コード検索のサマリー情報 |
| インターフェース | `CodeSearchOutput` | コード検索の出力結果 |
| インターフェース | `SymIndexInput` | シンボルインデックスの入力オプション |
| インターフェース | `SymIndexOutput` | シンボルインデックス作成の出力結果 |
| インターフェース | `SymFindInput` | シンボル検索の入力オプション |
| インターフェース | `SymbolDefinition` | シンボル定義を表すインターフェース |
| インターフェース | `CliOptions` | CLI実行オプション |
| インターフェース | `CliResult` | CLIコマンドの実行結果を表します |
| インターフェース | `CliError` | CLIエラー情報を表すインターフェース |
| インターフェース | `ToolAvailability` | 各ツールの利用可能性を表す |
| インターフェース | `ToolVersion` | ツールのバージョン情報 |
| インターフェース | `SymbolIndexEntry` | キャッシュされたシンボルインデックスのエントリ |
| インターフェース | `RgMatch` | Ripgrep JSON出力フォーマットのサブセット |
| インターフェース | `RgBegin` | ripgrepの検索開始メッセージ |
| インターフェース | `RgEnd` | ripgrepの検索終了メッセージ |
| インターフェース | `ManifestEntry` | マニフェストエントリ |
| インターフェース | `IndexMetadata` | インデックスのメタデータ構造 |
| インターフェース | `ShardHeader` | シャードヘッダー構造 |
| インターフェース | `CodeEmbedding` | コード埋め込みエントリ（セマンティック検索用） |
| インターフェース | `SemanticIndexInput` | セマンティックインデックスの入力パラメータ |
| インターフェース | `SemanticIndexOutput` | セマンティックインデックスの出力結果 |
| インターフェース | `SemanticSearchInput` | セマンティック検索の入力パラメータ |
| インターフェース | `SemanticSearchResult` | セマンティック検索の結果アイテム |
| インターフェース | `SemanticSearchOutput` | セマンティック検索の出力結果 |
| インターフェース | `SemanticIndexMetadata` | セマンティックインデックスのメタデータ |
| 型 | `FileCandidatesOutput` | ファイル候補の検索レスポンス |
| 型 | `SymFindOutput` | シンボル検索の出力型 |
| 型 | `RgOutput` | ripgrepの出力型（マッチ、開始、終了） |
| 型 | `IndexManifest` | インデックスマニフェスト構造 |

## 図解

### クラス図

```mermaid
classDiagram
  class SearchHints {
    <<interface>>
    +confidence: number
    +suggestedNextAction: refine_pattern_ex
    +alternativeTools: string
    +relatedQueries: string
  }
  class SearchDetails {
    <<interface>>
    +hints: SearchHints
  }
  class SearchResponse {
    <<interface>>
    +total: number
    +truncated: boolean
    +results: T
    +error: string
    +details: SearchDetails
  }
  class SearchErrorResponse {
    <<interface>>
    +error: string
    +total: T0
    +truncated: false
    +results: any
  }
  class FileCandidatesInput {
    <<interface>>
    +pattern: string
    +type: file_dir
    +extension: string
    +exclude: string
    +maxDepth: number
  }
  class FileCandidate {
    <<interface>>
    +path: string
    +type: file_dir
  }
  class CodeSearchInput {
    <<interface>>
    +pattern: string
    +path: string
    +type: string
    +ignoreCase: boolean
    +literal: boolean
  }
  class CodeSearchMatch {
    <<interface>>
    +file: string
    +line: number
    +column: number
    +text: string
    +context: string
  }
  class CodeSearchSummary {
    <<interface>>
    +file: string
    +count: number
  }
  class CodeSearchOutput {
    <<interface>>
    +total: number
    +truncated: boolean
    +summary: CodeSearchSummary
    +results: CodeSearchMatch
    +error: string
  }
  class SymIndexInput {
    <<interface>>
    +path: string
    +force: boolean
    +cwd: string
  }
  class SymIndexOutput {
    <<interface>>
    +indexed: number
    +outputPath: string
    +error: string
  }
  class SymFindInput {
    <<interface>>
    +name: string
    +kind: string
    +file: string
    +limit: number
    +cwd: string
  }
  class SymbolDefinition {
    <<interface>>
    +name: string
    +kind: string
    +file: string
    +line: number
    +signature: string
  }
  class CliOptions {
    <<interface>>
    +cwd: string
    +timeout: number
    +signal: AbortSignal
    +maxOutputSize: number
    +env: Record_string_string
  }
  class CliResult {
    <<interface>>
    +code: number
    +stdout: string
    +stderr: string
    +timedOut: boolean
    +killed: boolean
  }
  class CliError {
    <<interface>>
    +code: number
    +stdout: string
    +stderr: string
    +command: string
  }
  class ToolAvailability {
    <<interface>>
    +fd: boolean
    +rg: boolean
    +ctags: boolean
    +ctagsJson: boolean
  }
  class ToolVersion {
    <<interface>>
    +name: string
    +version: string
    +path: string
  }
  class SymbolIndexEntry {
    <<interface>>
    +name: string
    +kind: string
    +file: string
    +line: number
    +signature: string
  }
  class RgMatch {
    <<interface>>
    +type: match
    +data: path_text_string
  }
  class RgBegin {
    <<interface>>
    +type: begin
    +data: path_text_string
  }
  class RgEnd {
    <<interface>>
    +type: end
    +data: path_text_string
  }
  class ManifestEntry {
    <<interface>>
    +hash: string
    +mtime: number
    +shardId: number
  }
  class IndexMetadata {
    <<interface>>
    +createdAt: number
    +updatedAt: number
    +sourceDir: string
    +totalSymbols: number
    +totalFiles: number
  }
  class ShardHeader {
    <<interface>>
    +id: number
    +entryCount: number
    +createdAt: number
    +updatedAt: number
  }
  class CodeEmbedding {
    <<interface>>
    +id: string
    +file: string
    +line: number
    +code: string
    +embedding: number
  }
  class SemanticIndexInput {
    <<interface>>
    +path: string
    +force: boolean
    +chunkSize: number
    +chunkOverlap: number
    +extensions: string
  }
  class SemanticIndexOutput {
    <<interface>>
    +indexed: number
    +files: number
    +outputPath: string
    +error: string
  }
  class SemanticSearchInput {
    <<interface>>
    +query: string
    +topK: number
    +threshold: number
    +language: string
    +kind: function_class
  }
  class SemanticSearchResult {
    <<interface>>
    +file: string
    +line: number
    +code: string
    +similarity: number
    +metadata: CodeEmbedding_metad
  }
  class SemanticSearchOutput {
    <<interface>>
    +total: number
    +truncated: boolean
    +results: SemanticSearchResult
    +error: string
  }
  class SemanticIndexMetadata {
    <<interface>>
    +createdAt: number
    +updatedAt: number
    +sourceDir: string
    +totalEmbeddings: number
    +totalFiles: number
  }
```

## インターフェース

### SearchHints

```typescript
interface SearchHints {
  confidence: number;
  suggestedNextAction?: "refine_pattern" | "expand_scope" | "try_different_tool" | "increase_limit" | "regenerate_index";
  alternativeTools?: string[];
  relatedQueries?: string[];
}
```

検索結果に対するエージェントへのヒント。

### SearchDetails

```typescript
interface SearchDetails {
  hints?: SearchHints;
}
```

検索結果の追加詳細

### SearchResponse

```typescript
interface SearchResponse {
  total: number;
  truncated: boolean;
  results: T[];
  error?: string;
  details?: SearchDetails;
}
```

検索ツールの基本レスポンス構造

### SearchErrorResponse

```typescript
interface SearchErrorResponse {
  error: string;
  total: 0;
  truncated: false;
  results: [];
}
```

検索エラーレスポンス

### FileCandidatesInput

```typescript
interface FileCandidatesInput {
  pattern?: string;
  type?: "file" | "dir";
  extension?: string[];
  exclude?: string[];
  maxDepth?: number;
  limit?: number;
  cwd?: string;
}
```

ファイル候補の検索入力オプション

### FileCandidate

```typescript
interface FileCandidate {
  path: string;
  type: "file" | "dir";
}
```

ファイルまたはディレクトリの候補

### CodeSearchInput

```typescript
interface CodeSearchInput {
  pattern: string;
  path?: string;
  type?: string;
  ignoreCase?: boolean;
  literal?: boolean;
  context?: number;
  limit?: number;
  exclude?: string[];
  cwd?: string;
}
```

コード検索の入力パラメータ

### CodeSearchMatch

```typescript
interface CodeSearchMatch {
  file: string;
  line: number;
  column?: number;
  text: string;
  context?: string[];
}
```

コード検索のマッチ結果を表すインターフェース

### CodeSearchSummary

```typescript
interface CodeSearchSummary {
  file: string;
  count: number;
}
```

コード検索のサマリー情報

### CodeSearchOutput

```typescript
interface CodeSearchOutput {
  total: number;
  truncated: boolean;
  summary: CodeSearchSummary[];
  results: CodeSearchMatch[];
  error?: string;
  details?: SearchDetails;
}
```

コード検索の出力結果

### SymIndexInput

```typescript
interface SymIndexInput {
  path?: string;
  force?: boolean;
  cwd?: string;
}
```

シンボルインデックスの入力オプション

### SymIndexOutput

```typescript
interface SymIndexOutput {
  indexed: number;
  outputPath: string;
  error?: string;
}
```

シンボルインデックス作成の出力結果

### SymFindInput

```typescript
interface SymFindInput {
  name?: string;
  kind?: string[];
  file?: string;
  limit?: number;
  cwd?: string;
}
```

シンボル検索の入力オプション

### SymbolDefinition

```typescript
interface SymbolDefinition {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature?: string;
  scope?: string;
}
```

シンボル定義を表すインターフェース

### CliOptions

```typescript
interface CliOptions {
  cwd?: string;
  timeout?: number;
  signal?: AbortSignal;
  maxOutputSize?: number;
  env?: Record<string, string>;
}
```

CLI実行オプション

### CliResult

```typescript
interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  killed: boolean;
}
```

CLIコマンドの実行結果を表します

### CliError

```typescript
interface CliError {
  code: number;
  stdout: string;
  stderr: string;
  command: string;
}
```

CLIエラー情報を表すインターフェース

### ToolAvailability

```typescript
interface ToolAvailability {
  fd: boolean;
  rg: boolean;
  ctags: boolean;
  ctagsJson: boolean;
}
```

各ツールの利用可能性を表す

### ToolVersion

```typescript
interface ToolVersion {
  name: string;
  version: string;
  path: string;
}
```

ツールのバージョン情報

### SymbolIndexEntry

```typescript
interface SymbolIndexEntry {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature?: string;
  scope?: string;
  pattern?: string;
}
```

キャッシュされたシンボルインデックスのエントリ

### RgMatch

```typescript
interface RgMatch {
  type: "match";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}
```

Ripgrep JSON出力フォーマットのサブセット

### RgBegin

```typescript
interface RgBegin {
  type: "begin";
  data: {
    path: { text: string };
  };
}
```

ripgrepの検索開始メッセージ

### RgEnd

```typescript
interface RgEnd {
  type: "end";
  data: {
    path: { text: string };
    stats: {
      elapsed: { secs: number; nanos: number };
      searches: number;
      searches_with_match: number;
      bytes_searched: number;
      bytes_printed: number;
      matched_lines: number;
      matches: number;
    };
  };
}
```

ripgrepの検索終了メッセージ

### ManifestEntry

```typescript
interface ManifestEntry {
  hash: string;
  mtime: number;
  shardId: number;
}
```

マニフェストエントリ

### IndexMetadata

```typescript
interface IndexMetadata {
  createdAt: number;
  updatedAt: number;
  sourceDir: string;
  totalSymbols: number;
  totalFiles: number;
  shardCount: number;
  version: number;
}
```

インデックスのメタデータ構造

### ShardHeader

```typescript
interface ShardHeader {
  id: number;
  entryCount: number;
  createdAt: number;
  updatedAt: number;
}
```

シャードヘッダー構造

### CodeEmbedding

```typescript
interface CodeEmbedding {
  id: string;
  file: string;
  line: number;
  code: string;
  embedding: number[];
  metadata: {
    /** Programming language */
    language: string;

    /** Symbol name (if applicable) */
    symbol?: string;

    /** Kind of code chunk */
    kind?: "function" | "class" | "variable" | "chunk";

    /** Embedding dimensions */
    dimensions: number;

    /** Model used for embedding */
    model: string;

    /** Token count (approximate) */
    tokens?: number;
  };
}
```

コード埋め込みエントリ（セマンティック検索用）

### SemanticIndexInput

```typescript
interface SemanticIndexInput {
  path?: string;
  force?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
  extensions?: string[];
  cwd?: string;
}
```

セマンティックインデックスの入力パラメータ

### SemanticIndexOutput

```typescript
interface SemanticIndexOutput {
  indexed: number;
  files: number;
  outputPath: string;
  error?: string;
}
```

セマンティックインデックスの出力結果

### SemanticSearchInput

```typescript
interface SemanticSearchInput {
  query: string;
  topK?: number;
  threshold?: number;
  language?: string;
  kind?: ("function" | "class" | "variable" | "chunk")[];
  cwd?: string;
}
```

セマンティック検索の入力パラメータ

### SemanticSearchResult

```typescript
interface SemanticSearchResult {
  file: string;
  line: number;
  code: string;
  similarity: number;
  metadata: CodeEmbedding["metadata"];
}
```

セマンティック検索の結果アイテム

### SemanticSearchOutput

```typescript
interface SemanticSearchOutput {
  total: number;
  truncated: boolean;
  results: SemanticSearchResult[];
  error?: string;
}
```

セマンティック検索の出力結果

### SemanticIndexMetadata

```typescript
interface SemanticIndexMetadata {
  createdAt: number;
  updatedAt: number;
  sourceDir: string;
  totalEmbeddings: number;
  totalFiles: number;
  model: string;
  dimensions: number;
  version: number;
}
```

セマンティックインデックスのメタデータ

## 型定義

### FileCandidatesOutput

```typescript
type FileCandidatesOutput = SearchResponse<FileCandidate>
```

ファイル候補の検索レスポンス

### SymFindOutput

```typescript
type SymFindOutput = SearchResponse<SymbolDefinition>
```

シンボル検索の出力型

### RgOutput

```typescript
type RgOutput = RgMatch | RgBegin | RgEnd
```

ripgrepの出力型（マッチ、開始、終了）

### IndexManifest

```typescript
type IndexManifest = Record<string, ManifestEntry>
```

インデックスマニフェスト構造

---
*自動生成: 2026-02-18T07:17:30.299Z*
