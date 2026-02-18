---
title: output
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# output

## 概要

`output` モジュールのAPIリファレンス。

## インポート

```typescript
import { SearchResponse, FileCandidate, CodeSearchMatch... } from '../types';
import { SearchMetrics } from './metrics.js';
import { DEFAULT_LIMIT, DEFAULT_CODE_SEARCH_LIMIT, DEFAULT_SYMBOL_LIMIT } from './constants.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `truncateResults` | 検索結果を制限し、メタデータを含める |
| 関数 | `truncateHead` | Truncate from head (keep last N items). |
| 関数 | `parseFdOutput` | fdの出力をFileCandidate配列に変換 |
| 関数 | `formatFileCandidates` | ファイル候補を整形する |
| 関数 | `parseRgOutput` | ripgrepのJSON出力を解析します。 |
| 関数 | `summarizeResults` | サマリーマップを配列に変換し、カウント順にソートする |
| 関数 | `formatCodeSearch` | コード検索結果を表示用に整形する |
| 関数 | `parseCtagsOutput` | ctagsのJSON出力をパースする |
| 関数 | `parseCtagsTraditional` | 従来のctags形式を解析します。 |
| 関数 | `formatSymbols` | シンボルの検索結果をフォーマットする |
| 関数 | `createErrorResponse` | 標準化されたエラーレスポンスを作成する |
| 関数 | `createCodeSearchError` | コード検索のエラーレスポンスを作成する |
| 関数 | `formatError` | エラーを整形して表示用文字列を返す |
| 関数 | `escapeText` | 特殊文字をエスケープする |
| 関数 | `truncateText` | テキストを省略記号付きで切り詰める。 |
| 関数 | `relativePath` | 絶対パスから相対パスを計算する |
| 関数 | `enhanceOutput` | 検索レスポンスから拡張出力を生成する |
| 関数 | `suggestNextAction` | 検索結果に基づき推奨される次のアクションを決定します。 |
| 関数 | `createHints` | 検索結果からヒントを生成する |
| 関数 | `calculateSimpleConfidence` | シンプルな信頼度を計算する |
| 関数 | `createSimpleHints` | シンプルなパラメータからヒントを作成 |
| 関数 | `formatEnhancedOutput` | 拡張出力を表示用にフォーマットします。 |
| インターフェース | `SearchHints` | 検索結果のヒント情報 |
| インターフェース | `SearchStats` | 検索操作に関する統計情報。 |
| インターフェース | `EnhancedOutput` | エージェントのヒントや統計情報を含む拡張出力 |
| 型 | `SuggestedNextAction` | エージェント向けの推奨次回アクション |

## 図解

### クラス図

```mermaid
classDiagram
  class SearchHints {
    <<interface>>
    +confidence: number
    +suggestedNextAction: SuggestedNextAction
    +alternativeTools: string
    +relatedQueries: string
  }
  class SearchStats {
    <<interface>>
    +filesSearched: number
    +durationMs: number
    +indexHitRate: number
  }
  class EnhancedOutput {
    <<interface>>
    +results: T
    +total: number
    +truncated: boolean
    +error: string
    +hints: SearchHints
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[output]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types["types"]
    metrics["metrics"]
    constants["constants"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  truncateResults["truncateResults()"]
  truncateHead["truncateHead()"]
  parseFdOutput["parseFdOutput()"]
  formatFileCandidates["formatFileCandidates()"]
  parseRgOutput["parseRgOutput()"]
  summarizeResults["summarizeResults()"]
  truncateResults -.-> truncateHead
  truncateHead -.-> parseFdOutput
  parseFdOutput -.-> formatFileCandidates
  formatFileCandidates -.-> parseRgOutput
  parseRgOutput -.-> summarizeResults
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant output as "output"
  participant types as "types"
  participant metrics as "metrics"

  Caller->>output: truncateResults()
  output->>types: 内部関数呼び出し
  types-->>output: 結果
  output-->>Caller: SearchResponse_T

  Caller->>output: truncateHead()
  output-->>Caller: SearchResponse_T
```

## 関数

### truncateResults

```typescript
truncateResults(results: T[], limit: number): SearchResponse<T>
```

検索結果を制限し、メタデータを含める

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `T[]` | はい |
| limit | `number` | はい |

**戻り値**: `SearchResponse<T>`

### truncateHead

```typescript
truncateHead(results: T[], limit: number): SearchResponse<T>
```

Truncate from head (keep last N items).
Useful for keeping most recent/relevant results.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `T[]` | はい |
| limit | `number` | はい |

**戻り値**: `SearchResponse<T>`

### parseFdOutput

```typescript
parseFdOutput(stdout: string, type: "file" | "dir"): FileCandidate[]
```

fdの出力をFileCandidate配列に変換

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| stdout | `string` | はい |
| type | `"file" | "dir"` | はい |

**戻り値**: `FileCandidate[]`

### formatFileCandidates

```typescript
formatFileCandidates(output: SearchResponse<FileCandidate>): string
```

ファイル候補を整形する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `SearchResponse<FileCandidate>` | はい |

**戻り値**: `string`

### parseRgOutput

```typescript
parseRgOutput(stdout: string, contextLines: number): { matches: CodeSearchMatch[]; summary: Map<string, number> }
```

ripgrepのJSON出力を解析します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| stdout | `string` | はい |
| contextLines | `number` | はい |

**戻り値**: `{ matches: CodeSearchMatch[]; summary: Map<string, number> }`

### summarizeResults

```typescript
summarizeResults(summary: Map<string, number>): CodeSearchSummary[]
```

サマリーマップを配列に変換し、カウント順にソートする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| summary | `Map<string, number>` | はい |

**戻り値**: `CodeSearchSummary[]`

### formatCodeSearch

```typescript
formatCodeSearch(output: CodeSearchOutput): string
```

コード検索結果を表示用に整形する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `CodeSearchOutput` | はい |

**戻り値**: `string`

### parseCtagsOutput

```typescript
parseCtagsOutput(stdout: string): SymbolDefinition[]
```

ctagsのJSON出力をパースする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| stdout | `string` | はい |

**戻り値**: `SymbolDefinition[]`

### parseCtagsTraditional

```typescript
parseCtagsTraditional(stdout: string): SymbolDefinition[]
```

従来のctags形式を解析します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| stdout | `string` | はい |

**戻り値**: `SymbolDefinition[]`

### formatSymbols

```typescript
formatSymbols(output: SearchResponse<SymbolDefinition>): string
```

シンボルの検索結果をフォーマットする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `SearchResponse<SymbolDefinition>` | はい |

**戻り値**: `string`

### createErrorResponse

```typescript
createErrorResponse(error: string): SearchResponse<T>
```

標準化されたエラーレスポンスを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `string` | はい |

**戻り値**: `SearchResponse<T>`

### createCodeSearchError

```typescript
createCodeSearchError(error: string): CodeSearchOutput
```

コード検索のエラーレスポンスを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `string` | はい |

**戻り値**: `CodeSearchOutput`

### formatError

```typescript
formatError(tool: string, error: unknown): string
```

エラーを整形して表示用文字列を返す

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| tool | `string` | はい |
| error | `unknown` | はい |

**戻り値**: `string`

### escapeText

```typescript
escapeText(text: string): string
```

特殊文字をエスケープする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `string`

### truncateText

```typescript
truncateText(text: string, maxLength: number): string
```

テキストを省略記号付きで切り詰める。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| maxLength | `number` | はい |

**戻り値**: `string`

### relativePath

```typescript
relativePath(absolute: string, cwd: string): string
```

絶対パスから相対パスを計算する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| absolute | `string` | はい |
| cwd | `string` | はい |

**戻り値**: `string`

### enhanceOutput

```typescript
enhanceOutput(response: SearchResponse<T>, metrics: SearchMetrics, hints?: Partial<SearchHints>): EnhancedOutput<T>
```

検索レスポンスから拡張出力を生成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| response | `SearchResponse<T>` | はい |
| metrics | `SearchMetrics` | はい |
| hints | `Partial<SearchHints>` | いいえ |

**戻り値**: `EnhancedOutput<T>`

### calculateConfidence

```typescript
calculateConfidence(response: SearchResponse<T>, metrics: SearchMetrics): number
```

Calculate confidence score based on results and metrics.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| response | `SearchResponse<T>` | はい |
| metrics | `SearchMetrics` | はい |

**戻り値**: `number`

### suggestNextAction

```typescript
suggestNextAction(response: SearchResponse<T>, pattern?: string): SuggestedNextAction | undefined
```

検索結果に基づき推奨される次のアクションを決定します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| response | `SearchResponse<T>` | はい |
| pattern | `string` | いいえ |

**戻り値**: `SuggestedNextAction | undefined`

### createHints

```typescript
createHints(response: SearchResponse<T>, metrics: SearchMetrics, toolName: string): SearchHints
```

検索結果からヒントを生成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| response | `SearchResponse<T>` | はい |
| metrics | `SearchMetrics` | はい |
| toolName | `string` | はい |

**戻り値**: `SearchHints`

### getAlternativeTools

```typescript
getAlternativeTools(toolName: string): string[]
```

Get alternative tools for a given tool.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolName | `string` | はい |

**戻り値**: `string[]`

### calculateSimpleConfidence

```typescript
calculateSimpleConfidence(count: number, truncated: boolean): number
```

シンプルな信頼度を計算する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| count | `number` | はい |
| truncated | `boolean` | はい |

**戻り値**: `number`

### createSimpleHints

```typescript
createSimpleHints(toolName: string, resultCount: number, truncated: boolean, queryPattern?: string): SearchHints
```

シンプルなパラメータからヒントを作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolName | `string` | はい |
| resultCount | `number` | はい |
| truncated | `boolean` | はい |
| queryPattern | `string` | いいえ |

**戻り値**: `SearchHints`

### generateRelatedQueries

```typescript
generateRelatedQueries(query: string): string[]
```

Generate related query suggestions based on the original query.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| query | `string` | はい |

**戻り値**: `string[]`

### formatEnhancedOutput

```typescript
formatEnhancedOutput(output: EnhancedOutput<T>, formatResult: (result: T) => string): string
```

拡張出力を表示用にフォーマットします。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `EnhancedOutput<T>` | はい |
| formatResult | `(result: T) => string` | はい |

**戻り値**: `string`

### formatSuggestedAction

```typescript
formatSuggestedAction(action: SuggestedNextAction): string
```

Format suggested action for display.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| action | `SuggestedNextAction` | はい |

**戻り値**: `string`

## インターフェース

### SearchHints

```typescript
interface SearchHints {
  confidence: number;
  suggestedNextAction?: SuggestedNextAction;
  alternativeTools?: string[];
  relatedQueries?: string[];
}
```

検索結果のヒント情報

### SearchStats

```typescript
interface SearchStats {
  filesSearched: number;
  durationMs: number;
  indexHitRate?: number;
}
```

検索操作に関する統計情報。

### EnhancedOutput

```typescript
interface EnhancedOutput {
  results: T[];
  total: number;
  truncated: boolean;
  error?: string;
  hints: SearchHints;
  stats: SearchStats;
}
```

エージェントのヒントや統計情報を含む拡張出力

## 型定義

### SuggestedNextAction

```typescript
type SuggestedNextAction = | "refine_pattern"      // Pattern too broad, narrow it down
  | "expand_scope"        // Pattern too narrow, broaden search
  | "try_different_tool"  // Current tool not optimal
  | "increase_limit"      // Results truncated, may need more
  | "regenerate_index"
```

エージェント向けの推奨次回アクション

---
*自動生成: 2026-02-18T06:37:19.717Z*
