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
| インターフェース | `SearchHints` | Agent hints for search results. |
| インターフェース | `SearchDetails` | Additional details in search response. |
| インターフェース | `SearchResponse` | Base response structure for all search tools. |
| インターフェース | `SearchErrorResponse` | Error response structure for consistent error hand |
| インターフェース | `FileCandidatesInput` | - |
| インターフェース | `FileCandidate` | - |
| インターフェース | `CodeSearchInput` | - |
| インターフェース | `CodeSearchMatch` | - |
| インターフェース | `CodeSearchSummary` | - |
| インターフェース | `CodeSearchOutput` | - |
| インターフェース | `SymIndexInput` | - |
| インターフェース | `SymIndexOutput` | - |
| インターフェース | `SymFindInput` | - |
| インターフェース | `SymbolDefinition` | - |
| インターフェース | `CliOptions` | - |
| インターフェース | `CliResult` | - |
| インターフェース | `CliError` | - |
| インターフェース | `ToolAvailability` | - |
| インターフェース | `ToolVersion` | - |
| インターフェース | `SymbolIndexEntry` | Cached symbol index structure. |
| インターフェース | `RgMatch` | Ripgrep JSON output format (subset used). |
| インターフェース | `RgBegin` | - |
| インターフェース | `RgEnd` | - |
| インターフェース | `ManifestEntry` | Manifest entry for tracking file changes. |
| インターフェース | `IndexMetadata` | Index metadata structure. |
| インターフェース | `ShardHeader` | Shard header structure. |
| インターフェース | `CodeEmbedding` | Code embedding entry for semantic search. |
| インターフェース | `SemanticIndexInput` | Semantic index input parameters. |
| インターフェース | `SemanticIndexOutput` | Semantic index output result. |
| インターフェース | `SemanticSearchInput` | Semantic search input parameters. |
| インターフェース | `SemanticSearchResult` | Semantic search result item. |
| インターフェース | `SemanticSearchOutput` | Semantic search output result. |
| インターフェース | `SemanticIndexMetadata` | Semantic index metadata. |
| 型 | `FileCandidatesOutput` | - |
| 型 | `SymFindOutput` | - |
| 型 | `RgOutput` | - |
| 型 | `IndexManifest` | Index manifest structure. |

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

Agent hints for search results.

### SearchDetails

```typescript
interface SearchDetails {
  hints?: SearchHints;
}
```

Additional details in search response.

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

Base response structure for all search tools.
Includes pagination metadata for truncated results.

### SearchErrorResponse

```typescript
interface SearchErrorResponse {
  error: string;
  total: 0;
  truncated: false;
  results: [];
}
```

Error response structure for consistent error handling.

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

### FileCandidate

```typescript
interface FileCandidate {
  path: string;
  type: "file" | "dir";
}
```

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

### CodeSearchSummary

```typescript
interface CodeSearchSummary {
  file: string;
  count: number;
}
```

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

### SymIndexInput

```typescript
interface SymIndexInput {
  path?: string;
  force?: boolean;
  cwd?: string;
}
```

### SymIndexOutput

```typescript
interface SymIndexOutput {
  indexed: number;
  outputPath: string;
  error?: string;
}
```

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

### CliError

```typescript
interface CliError {
  code: number;
  stdout: string;
  stderr: string;
  command: string;
}
```

### ToolAvailability

```typescript
interface ToolAvailability {
  fd: boolean;
  rg: boolean;
  ctags: boolean;
  ctagsJson: boolean;
}
```

### ToolVersion

```typescript
interface ToolVersion {
  name: string;
  version: string;
  path: string;
}
```

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

Cached symbol index structure.
Stored as JSONL file for streaming reads.

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

Ripgrep JSON output format (subset used).
See: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md

### RgBegin

```typescript
interface RgBegin {
  type: "begin";
  data: {
    path: { text: string };
  };
}
```

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

### ManifestEntry

```typescript
interface ManifestEntry {
  hash: string;
  mtime: number;
  shardId: number;
}
```

Manifest entry for tracking file changes.
Used to detect which files need re-indexing.

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

Index metadata structure.
Contains global information about the index.

### ShardHeader

```typescript
interface ShardHeader {
  id: number;
  entryCount: number;
  createdAt: number;
  updatedAt: number;
}
```

Shard header structure.
Each shard file starts with this header.

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

Code embedding entry for semantic search.
Represents a chunk of code with its vector embedding.

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

Semantic index input parameters.

### SemanticIndexOutput

```typescript
interface SemanticIndexOutput {
  indexed: number;
  files: number;
  outputPath: string;
  error?: string;
}
```

Semantic index output result.

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

Semantic search input parameters.

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

Semantic search result item.

### SemanticSearchOutput

```typescript
interface SemanticSearchOutput {
  total: number;
  truncated: boolean;
  results: SemanticSearchResult[];
  error?: string;
}
```

Semantic search output result.

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

Semantic index metadata.
Stored alongside the index for tracking.

## 型定義

### FileCandidatesOutput

```typescript
type FileCandidatesOutput = SearchResponse<FileCandidate>
```

### SymFindOutput

```typescript
type SymFindOutput = SearchResponse<SymbolDefinition>
```

### RgOutput

```typescript
type RgOutput = RgMatch | RgBegin | RgEnd
```

### IndexManifest

```typescript
type IndexManifest = Record<string, ManifestEntry>
```

Index manifest structure.
Maps file paths to their manifest entries.

---
*自動生成: 2026-02-18T00:15:35.577Z*
