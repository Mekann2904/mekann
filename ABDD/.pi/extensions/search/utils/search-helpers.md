---
title: search-helpers
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# search-helpers

## 概要

`search-helpers` モジュールのAPIリファレンス。

## インポート

```typescript
import { CodeSearchMatch, SymbolDefinition, FileCandidate } from '../types';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `fileCandidateToUnified` | Convert FileCandidate to UnifiedSearchResult. |
| 関数 | `codeSearchMatchToUnified` | Convert CodeSearchMatch to UnifiedSearchResult. |
| 関数 | `symbolDefinitionToUnified` | Convert SymbolDefinition to UnifiedSearchResult. |
| 関数 | `mergeSearchResults` | Merge multiple UnifiedSearchResult arrays. |
| 関数 | `rankByRelevance` | Rank results by relevance to the query. |
| 関数 | `deduplicateResults` | Remove duplicate results based on file:line. |
| 関数 | `integrateSearchResults` | Process results from multiple tools into a unified |
| 関数 | `groupByFile` | Group results by file. |
| 関数 | `filterByType` | Filter results by type. |
| 関数 | `filterByFilePattern` | Filter results by file pattern. |
| 関数 | `formatUnifiedResult` | Format unified result for display. |
| 関数 | `formatUnifiedResults` | Format multiple unified results for display. |
| インターフェース | `UnifiedSearchResult` | Unified search result format across all tools. |
| インターフェース | `MergeOptions` | Options for merging results. |
| インターフェース | `RankOptions` | Options for ranking results. |

## 図解

### クラス図

```mermaid
classDiagram
  class UnifiedSearchResult {
    <<interface>>
    +file: string
    +line: number
    +column: number
    +snippet: string
    +score: number
  }
  class MergeOptions {
    <<interface>>
    +boostMultiSource: boolean
    +multiSourceBoost: number
    +limit: number
  }
  class RankOptions {
    <<interface>>
    +query: string
    +exactMatchWeight: number
    +partialMatchWeight: number
    +pathMatchWeight: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[search-helpers]
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
  fileCandidateToUnified["fileCandidateToUnified()"]
  codeSearchMatchToUnified["codeSearchMatchToUnified()"]
  symbolDefinitionToUnified["symbolDefinitionToUnified()"]
  mergeSearchResults["mergeSearchResults()"]
  rankByRelevance["rankByRelevance()"]
  deduplicateResults["deduplicateResults()"]
  fileCandidateToUnified -.-> codeSearchMatchToUnified
  codeSearchMatchToUnified -.-> symbolDefinitionToUnified
  symbolDefinitionToUnified -.-> mergeSearchResults
  mergeSearchResults -.-> rankByRelevance
  rankByRelevance -.-> deduplicateResults
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant search_helpers as "search-helpers"
  participant types as "types"

  Caller->>search_helpers: fileCandidateToUnified()
  search_helpers->>types: 内部関数呼び出し
  types-->>search_helpers: 結果
  search_helpers-->>Caller: UnifiedSearchResult

  Caller->>search_helpers: codeSearchMatchToUnified()
  search_helpers-->>Caller: UnifiedSearchResult
```

## 関数

### fileCandidateToUnified

```typescript
fileCandidateToUnified(candidate: FileCandidate, source: string): UnifiedSearchResult
```

Convert FileCandidate to UnifiedSearchResult.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| candidate | `FileCandidate` | はい |
| source | `string` | はい |

**戻り値**: `UnifiedSearchResult`

### codeSearchMatchToUnified

```typescript
codeSearchMatchToUnified(match: CodeSearchMatch, source: string): UnifiedSearchResult
```

Convert CodeSearchMatch to UnifiedSearchResult.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| match | `CodeSearchMatch` | はい |
| source | `string` | はい |

**戻り値**: `UnifiedSearchResult`

### symbolDefinitionToUnified

```typescript
symbolDefinitionToUnified(symbol: SymbolDefinition, source: string): UnifiedSearchResult
```

Convert SymbolDefinition to UnifiedSearchResult.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| symbol | `SymbolDefinition` | はい |
| source | `string` | はい |

**戻り値**: `UnifiedSearchResult`

### mergeSearchResults

```typescript
mergeSearchResults(resultArrays: UnifiedSearchResult[][], options: Partial<MergeOptions>): UnifiedSearchResult[]
```

Merge multiple UnifiedSearchResult arrays.
Deduplicates by file:line combination and combines sources.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| resultArrays | `UnifiedSearchResult[][]` | はい |
| options | `Partial<MergeOptions>` | はい |

**戻り値**: `UnifiedSearchResult[]`

### createResultKey

```typescript
createResultKey(result: UnifiedSearchResult): string
```

Create a unique key for a result.
Uses file + line + column for uniqueness.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `UnifiedSearchResult` | はい |

**戻り値**: `string`

### rankByRelevance

```typescript
rankByRelevance(results: UnifiedSearchResult[], query: string): UnifiedSearchResult[]
```

Rank results by relevance to the query.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `UnifiedSearchResult[]` | はい |
| query | `string` | はい |

**戻り値**: `UnifiedSearchResult[]`

### calculateRelevanceScore

```typescript
calculateRelevanceScore(result: UnifiedSearchResult, normalizedQuery: string, queryTerms: string[]): number
```

Calculate relevance score for a result.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `UnifiedSearchResult` | はい |
| normalizedQuery | `string` | はい |
| queryTerms | `string[]` | はい |

**戻り値**: `number`

### deduplicateResults

```typescript
deduplicateResults(results: UnifiedSearchResult[]): UnifiedSearchResult[]
```

Remove duplicate results based on file:line.
Keeps the result with the highest score.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `UnifiedSearchResult[]` | はい |

**戻り値**: `UnifiedSearchResult[]`

### integrateSearchResults

```typescript
integrateSearchResults(fileCandidates: FileCandidate[], codeMatches: CodeSearchMatch[], symbols: SymbolDefinition[], query: string, options: Partial<MergeOptions>): UnifiedSearchResult[]
```

Process results from multiple tools into a unified, ranked list.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| fileCandidates | `FileCandidate[]` | はい |
| codeMatches | `CodeSearchMatch[]` | はい |
| symbols | `SymbolDefinition[]` | はい |
| query | `string` | はい |
| options | `Partial<MergeOptions>` | はい |

**戻り値**: `UnifiedSearchResult[]`

### groupByFile

```typescript
groupByFile(results: UnifiedSearchResult[]): Map<string, UnifiedSearchResult[]>
```

Group results by file.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `UnifiedSearchResult[]` | はい |

**戻り値**: `Map<string, UnifiedSearchResult[]>`

### filterByType

```typescript
filterByType(results: UnifiedSearchResult[], type: "file" | "match" | "symbol"): UnifiedSearchResult[]
```

Filter results by type.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `UnifiedSearchResult[]` | はい |
| type | `"file" | "match" | "symbol"` | はい |

**戻り値**: `UnifiedSearchResult[]`

### filterByFilePattern

```typescript
filterByFilePattern(results: UnifiedSearchResult[], pattern: string): UnifiedSearchResult[]
```

Filter results by file pattern.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `UnifiedSearchResult[]` | はい |
| pattern | `string` | はい |

**戻り値**: `UnifiedSearchResult[]`

### formatUnifiedResult

```typescript
formatUnifiedResult(result: UnifiedSearchResult): string
```

Format unified result for display.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `UnifiedSearchResult` | はい |

**戻り値**: `string`

### formatUnifiedResults

```typescript
formatUnifiedResults(results: UnifiedSearchResult[]): string
```

Format multiple unified results for display.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `UnifiedSearchResult[]` | はい |

**戻り値**: `string`

## インターフェース

### UnifiedSearchResult

```typescript
interface UnifiedSearchResult {
  file: string;
  line?: number;
  column?: number;
  snippet?: string;
  score: number;
  sources: string[];
  type: "file" | "match" | "symbol";
  metadata?: Record<string, unknown>;
}
```

Unified search result format across all tools.

### MergeOptions

```typescript
interface MergeOptions {
  boostMultiSource: boolean;
  multiSourceBoost: number;
  limit: number;
}
```

Options for merging results.

### RankOptions

```typescript
interface RankOptions {
  query: string;
  exactMatchWeight: number;
  partialMatchWeight: number;
  pathMatchWeight: number;
}
```

Options for ranking results.

---
*自動生成: 2026-02-17T22:24:18.858Z*
