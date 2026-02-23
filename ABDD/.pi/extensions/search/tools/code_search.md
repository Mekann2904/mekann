---
title: code_search
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# code_search

## 概要

`code_search` モジュールのAPIリファレンス。

## インポート

```typescript
// from '../utils/cli.js': execute, buildRgArgs, checkToolAvailability
// from '../types.js': CodeSearchInput, CodeSearchOutput, CodeSearchMatch, ...
// from '../utils/output.js': truncateResults, parseRgOutput, summarizeResults, ...
// from '../utils/errors.js': SearchToolError, isSearchToolError, getErrorMessage, ...
// from '../utils/constants.js': DEFAULT_CODE_SEARCH_LIMIT, DEFAULT_IGNORE_CASE, DEFAULT_EXCLUDES, ...
// ... and 2 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `nativeCodeSearch` | Pure Node.js code search fallback |
| 関数 | `codeSearch` | コードを検索 |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[code_search]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    cli["cli"]
    types["types"]
    output["output"]
    errors["errors"]
    constants["constants"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  codeSearch["codeSearch()"]
  extractResultPaths["extractResultPaths()"]
  nativeCodeSearch["nativeCodeSearch()"]
  normalizeCodeSearchInput["normalizeCodeSearchInput()"]
  scanDir["scanDir()"]
  searchFile["searchFile()"]
  shouldExclude["shouldExclude()"]
  useRgCommand["useRgCommand()"]
  codeSearch --> extractResultPaths
  codeSearch --> nativeCodeSearch
  codeSearch --> normalizeCodeSearchInput
  codeSearch --> useRgCommand
  nativeCodeSearch --> normalizeCodeSearchInput
  nativeCodeSearch --> scanDir
  nativeCodeSearch --> searchFile
  nativeCodeSearch --> shouldExclude
  scanDir --> scanDir
  scanDir --> searchFile
  scanDir --> shouldExclude
  useRgCommand --> normalizeCodeSearchInput
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant code_search as "code_search"
  participant cli as "cli"
  participant types as "types"

  Caller->>code_search: nativeCodeSearch()
  activate code_search
  Note over code_search: 非同期処理開始
  code_search->>cli: 内部関数呼び出し
  cli-->>code_search: 結果
  deactivate code_search
  code_search-->>Caller: Promise_CodeSearchOu

  Caller->>code_search: codeSearch()
  activate code_search
  code_search-->>Caller: Promise_CodeSearchOu
  deactivate code_search
```

## 関数

### normalizeCodeSearchInput

```typescript
normalizeCodeSearchInput(input: CodeSearchInput): CodeSearchInput
```

Clamp code_search input values to safe bounds.
This prevents oversized responses that can bloat model context.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `CodeSearchInput` | はい |

**戻り値**: `CodeSearchInput`

### nativeCodeSearch

```typescript
async nativeCodeSearch(input: CodeSearchInput, cwd: string): Promise<CodeSearchOutput>
```

Pure Node.js code search fallback

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `CodeSearchInput` | はい |
| cwd | `string` | はい |

**戻り値**: `Promise<CodeSearchOutput>`

### searchFile

```typescript
async searchFile(filePath: string): Promise<void>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| filePath | `string` | はい |

**戻り値**: `Promise<void>`

### shouldExclude

```typescript
shouldExclude(name: string, patterns: readonly string[]): boolean
```

Check if a name matches any exclusion pattern.
Supports both exact matches and glob-style patterns (e.g., *.min.js).

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| name | `string` | はい |
| patterns | `readonly string[]` | はい |

**戻り値**: `boolean`

### scanDir

```typescript
async scanDir(dirPath: string): Promise<void>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| dirPath | `string` | はい |

**戻り値**: `Promise<void>`

### useRgCommand

```typescript
async useRgCommand(input: CodeSearchInput, cwd: string): Promise<CodeSearchOutput>
```

Use ripgrep command for code search

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `CodeSearchInput` | はい |
| cwd | `string` | はい |

**戻り値**: `Promise<CodeSearchOutput>`

### extractResultPaths

```typescript
extractResultPaths(results: CodeSearchMatch[]): string[]
```

Extract file paths from results for history recording.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `CodeSearchMatch[]` | はい |

**戻り値**: `string[]`

### codeSearch

```typescript
async codeSearch(input: CodeSearchInput, cwd: string): Promise<CodeSearchOutput>
```

コードを検索

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `CodeSearchInput` | はい |
| cwd | `string` | はい |

**戻り値**: `Promise<CodeSearchOutput>`

---
*自動生成: 2026-02-23T06:29:42.135Z*
