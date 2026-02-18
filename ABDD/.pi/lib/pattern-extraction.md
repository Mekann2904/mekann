---
title: pattern-extraction
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# pattern-extraction

## 概要

`pattern-extraction` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': existsSync, readFileSync
// from 'node:path': join
// from './fs-utils.js': ensureDir
// from './run-index.js': extractKeywords, classifyTaskType, extractFiles, ...
// from './storage-lock.js': atomicWriteTextFile
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `extractPatternFromRun` | 実行データからパターン抽出 |
| 関数 | `getPatternStoragePath` | 保存先パス取得 |
| 関数 | `loadPatternStorage` | パターンを読み込み |
| 関数 | `savePatternStorage` | パターンを保存 |
| 関数 | `addRunToPatterns` | 実行記録追加 |
| 関数 | `extractAllPatterns` | 全パターン抽出 |
| 関数 | `getPatternsForTaskType` | タスク別パターン取得 |
| 関数 | `getTopSuccessPatterns` | 成功パターン取得 |
| 関数 | `getFailurePatternsToAvoid` | 回避パターン取得 |
| 関数 | `findRelevantPatterns` | タスクに関連するパターンを検索 |
| インターフェース | `ExtractedPattern` | プランモードの状態を作成 |
| インターフェース | `PatternExample` | 抽出されたパターン情報 |
| インターフェース | `PatternStorage` | パターン例を表します |
| インターフェース | `RunData` | パターン抽出用の実行データ |

## 図解

### クラス図

```mermaid
classDiagram
  class ExtractedPattern {
    <<interface>>
    +id: string
    +patternType: success_failure
    +taskType: TaskType
    +description: string
    +keywords: string
  }
  class PatternExample {
    <<interface>>
    +runId: string
    +task: string
    +summary: string
    +timestamp: string
  }
  class PatternStorage {
    <<interface>>
    +version: number
    +lastUpdated: string
    +patterns: ExtractedPattern
    +patternsByTaskType: Record_TaskType_stri
  }
  class RunData {
    <<interface>>
    +runId: string
    +agentId: string
    +teamId: string
    +task: string
    +summary: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[pattern-extraction]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    fs_utils["fs-utils"]
    run_index["run-index"]
    storage_lock["storage-lock"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  addRunToPatterns["addRunToPatterns()"]
  arePatternsSimilar["arePatternsSimilar()"]
  extractAllPatterns["extractAllPatterns()"]
  extractPatternFromRun["extractPatternFromRun()"]
  findRelevantPatterns["findRelevantPatterns()"]
  generatePatternId["generatePatternId()"]
  getFailurePatternsToAvoid["getFailurePatternsToAvoid()"]
  getPatternStoragePath["getPatternStoragePath()"]
  getPatternsForTaskType["getPatternsForTaskType()"]
  getTopSuccessPatterns["getTopSuccessPatterns()"]
  isErrorResolved["isErrorResolved()"]
  isFailurePattern["isFailurePattern()"]
  isSuccessPattern["isSuccessPattern()"]
  loadPatternStorage["loadPatternStorage()"]
  mergePatterns["mergePatterns()"]
  savePatternStorage["savePatternStorage()"]
  addRunToPatterns --> arePatternsSimilar
  addRunToPatterns --> extractPatternFromRun
  addRunToPatterns --> loadPatternStorage
  addRunToPatterns --> mergePatterns
  addRunToPatterns --> savePatternStorage
  extractAllPatterns --> arePatternsSimilar
  extractAllPatterns --> extractPatternFromRun
  extractAllPatterns --> loadPatternStorage
  extractAllPatterns --> mergePatterns
  extractAllPatterns --> savePatternStorage
  extractPatternFromRun --> generatePatternId
  extractPatternFromRun --> isFailurePattern
  extractPatternFromRun --> isSuccessPattern
  findRelevantPatterns --> loadPatternStorage
  getFailurePatternsToAvoid --> loadPatternStorage
  getPatternsForTaskType --> loadPatternStorage
  getTopSuccessPatterns --> loadPatternStorage
  isFailurePattern --> isErrorResolved
  isFailurePattern --> isSuccessPattern
  loadPatternStorage --> getPatternStoragePath
  savePatternStorage --> getPatternStoragePath
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant pattern_extraction as "pattern-extraction"
  participant fs_utils as "fs-utils"
  participant run_index as "run-index"

  Caller->>pattern_extraction: extractPatternFromRun()
  pattern_extraction->>fs_utils: 内部関数呼び出し
  fs_utils-->>pattern_extraction: 結果
  pattern_extraction-->>Caller: ExtractedPattern_nul

  Caller->>pattern_extraction: getPatternStoragePath()
  pattern_extraction-->>Caller: string
```

## 関数

### generatePatternId

```typescript
generatePatternId(taskType: TaskType, keywords: string[]): string
```

Generate a unique pattern ID.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| taskType | `TaskType` | はい |
| keywords | `string[]` | はい |

**戻り値**: `string`

### isSuccessPattern

```typescript
isSuccessPattern(summary: string): boolean
```

Detect if a run represents a success pattern.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| summary | `string` | はい |

**戻り値**: `boolean`

### isErrorResolved

```typescript
isErrorResolved(summary: string): boolean
```

Check if "error" appears in a resolved context (e.g., "fixed error", "resolved error").

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| summary | `string` | はい |

**戻り値**: `boolean`

### isFailurePattern

```typescript
isFailurePattern(summary: string, status: string): boolean
```

Detect if a run represents a failure pattern.
Improved logic to avoid false positives from resolved errors.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| summary | `string` | はい |
| status | `string` | はい |

**戻り値**: `boolean`

### extractPatternFromRun

```typescript
extractPatternFromRun(run: RunData): ExtractedPattern | null
```

実行データからパターン抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| run | `RunData` | はい |

**戻り値**: `ExtractedPattern | null`

### mergePatterns

```typescript
mergePatterns(existing: ExtractedPattern, newPattern: ExtractedPattern): ExtractedPattern
```

Merge two patterns if they are similar.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| existing | `ExtractedPattern` | はい |
| newPattern | `ExtractedPattern` | はい |

**戻り値**: `ExtractedPattern`

### arePatternsSimilar

```typescript
arePatternsSimilar(a: ExtractedPattern, b: ExtractedPattern): boolean
```

Check if two patterns are similar enough to merge.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `ExtractedPattern` | はい |
| b | `ExtractedPattern` | はい |

**戻り値**: `boolean`

### getPatternStoragePath

```typescript
getPatternStoragePath(cwd: string): string
```

保存先パス取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `string`

### loadPatternStorage

```typescript
loadPatternStorage(cwd: string): PatternStorage
```

パターンを読み込み

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `PatternStorage`

### savePatternStorage

```typescript
savePatternStorage(cwd: string, storage: PatternStorage): void
```

パターンを保存

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| storage | `PatternStorage` | はい |

**戻り値**: `void`

### addRunToPatterns

```typescript
addRunToPatterns(cwd: string, run: RunData): void
```

実行記録追加

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| run | `RunData` | はい |

**戻り値**: `void`

### extractAllPatterns

```typescript
extractAllPatterns(cwd: string): PatternStorage
```

全パターン抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `PatternStorage`

### getPatternsForTaskType

```typescript
getPatternsForTaskType(cwd: string, taskType: TaskType, patternType?: "success" | "failure" | "approach"): ExtractedPattern[]
```

タスク別パターン取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| taskType | `TaskType` | はい |
| patternType | `"success" | "failure" | "approach"` | いいえ |

**戻り値**: `ExtractedPattern[]`

### getTopSuccessPatterns

```typescript
getTopSuccessPatterns(cwd: string, limit: number): ExtractedPattern[]
```

成功パターン取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| limit | `number` | はい |

**戻り値**: `ExtractedPattern[]`

### getFailurePatternsToAvoid

```typescript
getFailurePatternsToAvoid(cwd: string, taskType?: TaskType): ExtractedPattern[]
```

回避パターン取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| taskType | `TaskType` | いいえ |

**戻り値**: `ExtractedPattern[]`

### findRelevantPatterns

```typescript
findRelevantPatterns(cwd: string, taskDescription: string, limit: number): ExtractedPattern[]
```

タスクに関連するパターンを検索

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| taskDescription | `string` | はい |
| limit | `number` | はい |

**戻り値**: `ExtractedPattern[]`

## インターフェース

### ExtractedPattern

```typescript
interface ExtractedPattern {
  id: string;
  patternType: "success" | "failure" | "approach";
  taskType: TaskType;
  description: string;
  keywords: string[];
  files: string[];
  agentOrTeam: string;
  frequency: number;
  lastSeen: string;
  confidence: number;
  examples: PatternExample[];
}
```

プランモードの状態を作成

### PatternExample

```typescript
interface PatternExample {
  runId: string;
  task: string;
  summary: string;
  timestamp: string;
}
```

抽出されたパターン情報

### PatternStorage

```typescript
interface PatternStorage {
  version: number;
  lastUpdated: string;
  patterns: ExtractedPattern[];
  patternsByTaskType: Record<TaskType, string[]>;
}
```

パターン例を表します

### RunData

```typescript
interface RunData {
  runId: string;
  agentId?: string;
  teamId?: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  error?: string;
}
```

パターン抽出用の実行データ

---
*自動生成: 2026-02-18T15:54:41.500Z*
