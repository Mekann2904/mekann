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
| インターフェース | `SearchHints` | 検索結果のヒント情報 |
| インターフェース | `SearchDetails` | 検索に関するヒント情報 |
| インターフェース | `SearchResponse` | 検索結果の追加詳細 |
| インターフェース | `SearchErrorResponse` | 検索エラーレスポンス |
| インターフェース | `FileCandidatesInput` | ファイル候補入力 |
| インターフェース | `FileCandidate` | - |
| インターフェース | `CodeSearchInput` | - |
| インターフェース | `CodeSearchMatch` | コード検索マッチ |
| インターフェース | `CodeSearchSummary` | コード検索サマリ |
| インターフェース | `CodeSearchOutput` | コード検索出力 |
| インターフェース | `SymIndexInput` | シンボルインデックス入力 |
| インターフェース | `SymIndexOutput` | シンボルインデックス出力 |
| インターフェース | `SymFindInput` | シンボル検索の入力パラメータ |
| インターフェース | `SymbolDefinition` | シンボルの定義情報 |
| インターフェース | `CliOptions` | CLI実行時のオプション設定 |
| インターフェース | `CliResult` | CLI実行結果を表す |
| インターフェース | `CliError` | CLIコマンド実行時のエラー情報を表します |
| インターフェース | `ToolAvailability` | 外部ツールの利用可能性を表します |
| インターフェース | `ToolVersion` | 外部ツールのバージョン情報を表します |
| インターフェース | `SymbolIndexEntry` | シンボルインデックスのエントリを表します |
| インターフェース | `RgMatch` | 正規表現マッチ結果を表します |
| インターフェース | `RgBegin` | 検索開始メッセージ型 |
| インターフェース | `RgEnd` | 検索終了メッセージ型 |
| インターフェース | `ManifestEntry` | マニフェストエントリ情報 |
| インターフェース | `IndexMetadata` | - |
| インターフェース | `ShardHeader` | シャードヘッダー定義 |
| インターフェース | `CodeEmbedding` | コード埋め込みエントリ（セマンティック検索用） |
| インターフェース | `SemanticIndexInput` | セマンティックインデックスの入力パラメータ |
| インターフェース | `SemanticIndexOutput` | セマンティックインデックスの出力 |
| インターフェース | `SemanticSearchInput` | 検索の入力設定 |
| インターフェース | `SemanticSearchResult` | 単一の検索結果 |
| インターフェース | `SemanticSearchOutput` | 検索結果の出力形式 |
| インターフェース | `SemanticIndexMetadata` | インデックスのメタデータ |
| インターフェース | `ContextExploreStep` | 階層的文脈検索のステップ定義 |
| インターフェース | `ContextExploreInput` | 階層的文脈検索の入力パラメータ |
| インターフェース | `ContextExploreStepResult` | 単一ステップの実行結果 |
| インターフェース | `ContextExploreOutput` | 階層的文脈検索の出力 |
| インターフェース | `SearchClassInput` | クラス検索の入力パラメータ |
| インターフェース | `ClassMethod` | クラス内メソッド情報 |
| インターフェース | `ClassSearchResult` | クラス検索結果の単一エントリ |
| インターフェース | `SearchClassOutput` | クラス検索の出力結果 |
| インターフェース | `SearchMethodInput` | メソッド検索の入力パラメータ |
| インターフェース | `MethodSearchResult` | メソッド検索結果の単一エントリ |
| インターフェース | `SearchMethodOutput` | メソッド検索の出力結果 |
| インターフェース | `FaultLocalizeInput` | バグ位置特定の入力パラメータ |
| インターフェース | `SuspiciousLocation` | 単一の怪しいコード位置 |
| インターフェース | `FaultLocalizeResult` | バグ位置特定の出力結果 |
| インターフェース | `SearchHistoryInput` | 検索履歴の入力パラメータ |
| インターフェース | `HistoryQuery` | 履歴クエリ情報 |
| インターフェース | `SearchHistoryResult` | 検索履歴の出力結果 |
| インターフェース | `HistorySession` | セッション情報 |
| インターフェース | `AstNode` | ASTノード情報 |
| インターフェース | `AstSummaryInput` | AST要約の入力パラメータ |
| インターフェース | `AstSummaryStats` | AST要約の統計情報 |
| インターフェース | `AstSummaryResult` | AST要約の出力結果 |
| インターフェース | `MergeSource` | マージ対象の検索ソース |
| インターフェース | `MergeResultsInput` | 統合検索結果の入力パラメータ |
| インターフェース | `MergedResult` | 統合された検索結果 |
| インターフェース | `MergeResultsStats` | 統合検索の統計情報 |
| インターフェース | `MergeResultsResult` | 統合検索の出力結果 |
| 型 | `ContextBudgetWarning` | コンテキスト予算警告レベル |
| 型 | `FileCandidatesOutput` | ファイル候補の検索レスポンス |
| 型 | `DetailLevel` | シンボル検索の詳細レベル |
| 型 | `SymFindOutput` | シンボル検索の出力結果 |
| 型 | `RgOutput` | ripgrep出力の共用体型 |
| 型 | `IndexManifest` | インデックスマニフェスト型 |
| 型 | `SBFLAlgorithm` | SBFLアルゴリズムの種類 |
| 型 | `AstNodeKind` | ASTノードの種類 |
| 型 | `SearchSourceType` | 検索ソースの種類 |
| 型 | `MergeStrategy` | マージ戦略 |

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
    +estimatedTokens: number
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
    +scope: string
    +limit: number
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
  class ContextExploreStep {
    <<interface>>
    +type: find_class_find_m
    +query: string
    +classRef: string
    +scope: string
  }
  class ContextExploreInput {
    <<interface>>
    +steps: ContextExploreStep
    +contextBudget: number
    +compression: full_signature
    +cwd: string
  }
  class ContextExploreStepResult {
    <<interface>>
    +stepIndex: number
    +type: ContextExploreStep
    +count: number
    +estimatedTokens: number
    +results: unknown
  }
  class ContextExploreOutput {
    <<interface>>
    +total: number
    +compressed: boolean
    +estimatedTokens: number
    +contextBudget: number
    +steps: ContextExploreStepRe
  }
  class SearchClassInput {
    <<interface>>
    +name: string
    +includeMethods: boolean
    +detailLevel: DetailLevel
    +file: string
    +limit: number
  }
  class ClassMethod {
    <<interface>>
    +name: string
    +signature: string
    +line: number
    +kind: string
  }
  class ClassSearchResult {
    <<interface>>
    +name: string
    +kind: string
    +file: string
    +line: number
    +signature: string
  }
  class SearchClassOutput {
    <<interface>>
    +total: number
    +truncated: boolean
    +results: ClassSearchResult
    +error: string
    +details: SearchDetails
  }
  class SearchMethodInput {
    <<interface>>
    +method: string
    +className: string
    +includeImplementation: boolean
    +detailLevel: DetailLevel
    +file: string
  }
  class MethodSearchResult {
    <<interface>>
    +name: string
    +kind: string
    +file: string
    +line: number
    +signature: string
  }
  class SearchMethodOutput {
    <<interface>>
    +total: number
    +truncated: boolean
    +results: MethodSearchResult
    +error: string
    +details: SearchDetails
  }
  class FaultLocalizeInput {
    <<interface>>
    +testCommand: string
    +failingTests: string
    +passingTests: string
    +suspiciousnessThreshold: number
    +coverageReport: string
  }
  class SuspiciousLocation {
    <<interface>>
    +method: string
    +file: string
    +line: number
    +suspiciousness: number
    +coveredByFailing: number
  }
  class FaultLocalizeResult {
    <<interface>>
    +locations: SuspiciousLocation
    +algorithm: SBFLAlgorithm
    +totalTests: number
    +failingTestCount: number
    +passingTestCount: number
  }
  class SearchHistoryInput {
    <<interface>>
    +action: get_clear_save
    +session: current_previous
    +limit: number
    +query: string
    +tool: string
  }
  class HistoryQuery {
    <<interface>>
    +query: string
    +tool: string
    +timestamp: string
    +resultCount: number
  }
  class SearchHistoryResult {
    <<interface>>
    +queries: HistoryQuery
    +session: string
    +total: number
    +sessions: HistorySession
    +error: string
  }
  class HistorySession {
    <<interface>>
    +id: string
    +startTime: number
    +endTime: number
    +entryCount: number
  }
  class AstNode {
    <<interface>>
    +name: string
    +kind: AstNodeKind
    +signature: string
    +line: number
    +children: AstNode
  }
  class AstSummaryInput {
    <<interface>>
    +file: string
    +format: tree_flat_json
    +depth: number
    +includeTypes: boolean
    +includeCalls: boolean
  }
  class AstSummaryStats {
    <<interface>>
    +totalClasses: number
    +totalFunctions: number
    +totalMethods: number
    +totalVariables: number
  }
  class AstSummaryResult {
    <<interface>>
    +file: string
    +format: string
    +root: AstNode
    +stats: AstSummaryStats
    +error: string
  }
  class MergeSource {
    <<interface>>
    +type: SearchSourceType
    +query: string
    +weight: number
  }
  class MergeResultsInput {
    <<interface>>
    +sources: MergeSource
    +deduplicate: boolean
    +limit: number
    +mergeStrategy: MergeStrategy
  }
  class MergedResult {
    <<interface>>
    +file: string
    +line: number
    +content: string
    +score: number
    +sources: string
  }
  class MergeResultsStats {
    <<interface>>
    +totalSources: number
    +totalResults: number
    +duplicatesRemoved: number
  }
  class MergeResultsResult {
    <<interface>>
    +merged: MergedResult
    +stats: MergeResultsStats
    +error: string
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
  estimatedTokens?: number;
  contextBudgetWarning?: ContextBudgetWarning;
}
```

検索結果のヒント情報

### SearchDetails

```typescript
interface SearchDetails {
  hints?: SearchHints;
}
```

検索に関するヒント情報

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

検索結果の追加詳細

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

ファイル候補入力

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

コード検索マッチ

### CodeSearchSummary

```typescript
interface CodeSearchSummary {
  file: string;
  count: number;
}
```

コード検索サマリ

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

コード検索出力

### SymIndexInput

```typescript
interface SymIndexInput {
  path?: string;
  force?: boolean;
  cwd?: string;
}
```

シンボルインデックス入力

### SymIndexOutput

```typescript
interface SymIndexOutput {
  indexed: number;
  outputPath: string;
  error?: string;
}
```

シンボルインデックス出力

### SymFindInput

```typescript
interface SymFindInput {
  name?: string;
  kind?: string[];
  file?: string;
  scope?: string;
  limit?: number;
  detailLevel?: DetailLevel;
  cwd?: string;
}
```

シンボル検索の入力パラメータ

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

シンボルの定義情報

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

CLI実行時のオプション設定

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

CLI実行結果を表す

### CliError

```typescript
interface CliError {
  code: number;
  stdout: string;
  stderr: string;
  command: string;
}
```

CLIコマンド実行時のエラー情報を表します

### ToolAvailability

```typescript
interface ToolAvailability {
  fd: boolean;
  rg: boolean;
  ctags: boolean;
  ctagsJson: boolean;
}
```

外部ツールの利用可能性を表します

### ToolVersion

```typescript
interface ToolVersion {
  name: string;
  version: string;
  path: string;
}
```

外部ツールのバージョン情報を表します

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

シンボルインデックスのエントリを表します

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

正規表現マッチ結果を表します

### RgBegin

```typescript
interface RgBegin {
  type: "begin";
  data: {
    path: { text: string };
  };
}
```

検索開始メッセージ型

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

検索終了メッセージ型

### ManifestEntry

```typescript
interface ManifestEntry {
  hash: string;
  mtime: number;
  shardId: number;
}
```

マニフェストエントリ情報

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

### ShardHeader

```typescript
interface ShardHeader {
  id: number;
  entryCount: number;
  createdAt: number;
  updatedAt: number;
}
```

シャードヘッダー定義

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

セマンティックインデックスの出力

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

検索の入力設定

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

単一の検索結果

### SemanticSearchOutput

```typescript
interface SemanticSearchOutput {
  total: number;
  truncated: boolean;
  results: SemanticSearchResult[];
  error?: string;
}
```

検索結果の出力形式

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

インデックスのメタデータ

### ContextExploreStep

```typescript
interface ContextExploreStep {
  type: "find_class" | "find_methods" | "search_code" | "get_callers";
  query?: string;
  classRef?: string;
  scope?: string;
}
```

階層的文脈検索のステップ定義

### ContextExploreInput

```typescript
interface ContextExploreInput {
  steps: ContextExploreStep[];
  contextBudget?: number;
  compression?: "full" | "signature" | "summary";
  cwd?: string;
}
```

階層的文脈検索の入力パラメータ

### ContextExploreStepResult

```typescript
interface ContextExploreStepResult {
  stepIndex: number;
  type: ContextExploreStep["type"];
  count: number;
  estimatedTokens: number;
  results: unknown[];
}
```

単一ステップの実行結果

### ContextExploreOutput

```typescript
interface ContextExploreOutput {
  total: number;
  compressed: boolean;
  estimatedTokens: number;
  contextBudget: number;
  steps: ContextExploreStepResult[];
  error?: string;
  details?: SearchDetails;
}
```

階層的文脈検索の出力

### SearchClassInput

```typescript
interface SearchClassInput {
  name: string;
  includeMethods?: boolean;
  detailLevel?: DetailLevel;
  file?: string;
  limit?: number;
}
```

クラス検索の入力パラメータ

### ClassMethod

```typescript
interface ClassMethod {
  name: string;
  signature?: string;
  line: number;
  kind: string;
}
```

クラス内メソッド情報

### ClassSearchResult

```typescript
interface ClassSearchResult {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature?: string;
  methods?: ClassMethod[];
}
```

クラス検索結果の単一エントリ

### SearchClassOutput

```typescript
interface SearchClassOutput {
  total: number;
  truncated: boolean;
  results: ClassSearchResult[];
  error?: string;
  details?: SearchDetails;
}
```

クラス検索の出力結果

### SearchMethodInput

```typescript
interface SearchMethodInput {
  method: string;
  className?: string;
  includeImplementation?: boolean;
  detailLevel?: DetailLevel;
  file?: string;
  limit?: number;
}
```

メソッド検索の入力パラメータ

### MethodSearchResult

```typescript
interface MethodSearchResult {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature?: string;
  scope?: string;
  implementation?: string;
}
```

メソッド検索結果の単一エントリ

### SearchMethodOutput

```typescript
interface SearchMethodOutput {
  total: number;
  truncated: boolean;
  results: MethodSearchResult[];
  error?: string;
  details?: SearchDetails;
}
```

メソッド検索の出力結果

### FaultLocalizeInput

```typescript
interface FaultLocalizeInput {
  testCommand: string;
  failingTests?: string[];
  passingTests?: string[];
  suspiciousnessThreshold?: number;
  coverageReport?: string;
  algorithm?: SBFLAlgorithm;
}
```

バグ位置特定の入力パラメータ

### SuspiciousLocation

```typescript
interface SuspiciousLocation {
  method: string;
  file: string;
  line: number;
  suspiciousness: number;
  coveredByFailing: number;
  coveredByPassing: number;
}
```

単一の怪しいコード位置

### FaultLocalizeResult

```typescript
interface FaultLocalizeResult {
  locations: SuspiciousLocation[];
  algorithm: SBFLAlgorithm;
  totalTests: number;
  failingTestCount: number;
  passingTestCount: number;
  testExecuted: boolean;
  error?: string;
  details?: SearchDetails;
}
```

バグ位置特定の出力結果

### SearchHistoryInput

```typescript
interface SearchHistoryInput {
  action: "get" | "clear" | "save_query";
  session?: "current" | "previous" | "all";
  limit?: number;
  query?: string;
  tool?: string;
}
```

検索履歴の入力パラメータ

### HistoryQuery

```typescript
interface HistoryQuery {
  query: string;
  tool: string;
  timestamp: string;
  resultCount: number;
}
```

履歴クエリ情報

### SearchHistoryResult

```typescript
interface SearchHistoryResult {
  queries: HistoryQuery[];
  session: string;
  total: number;
  sessions?: HistorySession[];
  error?: string;
  details?: SearchDetails;
}
```

検索履歴の出力結果

### HistorySession

```typescript
interface HistorySession {
  id: string;
  startTime: number;
  endTime?: number;
  entryCount: number;
}
```

セッション情報

### AstNode

```typescript
interface AstNode {
  name: string;
  kind: AstNodeKind;
  signature?: string;
  line?: number;
  children?: AstNode[];
  calls?: string[];
}
```

ASTノード情報

### AstSummaryInput

```typescript
interface AstSummaryInput {
  file: string;
  format?: "tree" | "flat" | "json";
  depth?: number;
  includeTypes?: boolean;
  includeCalls?: boolean;
}
```

AST要約の入力パラメータ

### AstSummaryStats

```typescript
interface AstSummaryStats {
  totalClasses: number;
  totalFunctions: number;
  totalMethods: number;
  totalVariables: number;
}
```

AST要約の統計情報

### AstSummaryResult

```typescript
interface AstSummaryResult {
  file: string;
  format: string;
  root: AstNode[];
  stats: AstSummaryStats;
  error?: string;
}
```

AST要約の出力結果

### MergeSource

```typescript
interface MergeSource {
  type: SearchSourceType;
  query: string;
  weight?: number;
}
```

マージ対象の検索ソース

### MergeResultsInput

```typescript
interface MergeResultsInput {
  sources: MergeSource[];
  deduplicate?: boolean;
  limit?: number;
  mergeStrategy?: MergeStrategy;
}
```

統合検索結果の入力パラメータ

### MergedResult

```typescript
interface MergedResult {
  file: string;
  line?: number;
  content: string;
  score: number;
  sources: string[];
}
```

統合された検索結果

### MergeResultsStats

```typescript
interface MergeResultsStats {
  totalSources: number;
  totalResults: number;
  duplicatesRemoved: number;
}
```

統合検索の統計情報

### MergeResultsResult

```typescript
interface MergeResultsResult {
  merged: MergedResult[];
  stats: MergeResultsStats;
  error?: string;
}
```

統合検索の出力結果

## 型定義

### ContextBudgetWarning

```typescript
type ContextBudgetWarning = "ok" | "approaching" | "exceeds_recommended"
```

コンテキスト予算警告レベル

### FileCandidatesOutput

```typescript
type FileCandidatesOutput = SearchResponse<FileCandidate>
```

ファイル候補の検索レスポンス

### DetailLevel

```typescript
type DetailLevel = "full" | "signature" | "outline"
```

シンボル検索の詳細レベル

### SymFindOutput

```typescript
type SymFindOutput = SearchResponse<SymbolDefinition>
```

シンボル検索の出力結果

### RgOutput

```typescript
type RgOutput = RgMatch | RgBegin | RgEnd
```

ripgrep出力の共用体型

### IndexManifest

```typescript
type IndexManifest = Record<string, ManifestEntry>
```

インデックスマニフェスト型

### SBFLAlgorithm

```typescript
type SBFLAlgorithm = "ochiai" | "tarantula" | "op2"
```

SBFLアルゴリズムの種類

### AstNodeKind

```typescript
type AstNodeKind = "class" | "function" | "method" | "variable" | "interface" | "enum"
```

ASTノードの種類

### SearchSourceType

```typescript
type SearchSourceType = "semantic" | "symbol" | "code"
```

検索ソースの種類

### MergeStrategy

```typescript
type MergeStrategy = "weighted" | "rank_fusion" | "interleave"
```

マージ戦略

---
*自動生成: 2026-02-24T17:08:02.433Z*
