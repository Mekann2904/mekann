---
title: run-index
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# run-index

## 概要

`run-index` モジュールのAPIリファレンス。

## インポート

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir } from './fs-utils.js';
import { atomicWriteTextFile } from './storage-lock.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `extractKeywords` | テキストからキーワードを抽出します。 |
| 関数 | `classifyTaskType` | キーワードに基づいてタスクの種類を分類する |
| 関数 | `extractFiles` | テキストからファイルパスを抽出する |
| 関数 | `indexSubagentRun` | サブエージェントの実行記録からインデックスを作成 |
| 関数 | `indexTeamRun` | チーム実行レコードからインデックスを作成 |
| 関数 | `buildRunIndex` | Build the complete run index from storage files. |
| 関数 | `getRunIndexPath` | ランインデックスのファイルパスを取得する |
| 関数 | `loadRunIndex` | ディスクから実行インデックスを読み込む |
| 関数 | `saveRunIndex` | 実行インデックスを保存する |
| 関数 | `getOrBuildRunIndex` | 実行インデックスを取得または構築 |
| 関数 | `searchRuns` | クエリに一致する実行を検索します。 |
| 関数 | `findSimilarRuns` | タスク説明に基づき類似の過去の実行を検索 |
| 関数 | `getRunsByType` | タスクタイプに対応する実行を取得する |
| 関数 | `getSuccessfulPatterns` | 指定したタスクタイプの成功したパターンを取得 |
| インターフェース | `IndexedRun` | 抽出されたキーワードとタグを持つインデックス化された実行レコード |
| インターフェース | `RunIndex` | 実行インデックスの構造。 |
| インターフェース | `SearchOptions` | インデックス検索のオプション |
| インターフェース | `SearchResult` | 検索結果と関連性スコア |
| 型 | `TaskType` | タスクの種類を表す型 |

## 図解

### クラス図

```mermaid
classDiagram
  class IndexedRun {
    <<interface>>
    +runId: string
    +source: subagent_agent_te
    +agentId: string
    +teamId: string
    +task: string
  }
  class RunIndex {
    <<interface>>
    +version: number
    +lastUpdated: string
    +runs: IndexedRun
    +keywordIndex: Record_string_string
    +taskTypeIndex: Record_TaskType_stri
  }
  class SearchOptions {
    <<interface>>
    +limit: number
    +status: completed_failed
    +taskType: TaskType
    +minKeywordMatch: number
  }
  class SearchResult {
    <<interface>>
    +run: IndexedRun
    +score: number
    +matchedKeywords: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[run-index]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    fs_utils["fs-utils"]
    storage_lock["storage-lock"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  extractKeywords["extractKeywords()"]
  classifyTaskType["classifyTaskType()"]
  extractFiles["extractFiles()"]
  indexSubagentRun["indexSubagentRun()"]
  indexTeamRun["indexTeamRun()"]
  buildRunIndex["buildRunIndex()"]
  extractKeywords -.-> classifyTaskType
  classifyTaskType -.-> extractFiles
  extractFiles -.-> indexSubagentRun
  indexSubagentRun -.-> indexTeamRun
  indexTeamRun -.-> buildRunIndex
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant run_index as "run-index"
  participant fs_utils as "fs-utils"
  participant storage_lock as "storage-lock"

  Caller->>run_index: extractKeywords()
  run_index->>fs_utils: 内部関数呼び出し
  fs_utils-->>run_index: 結果
  run_index-->>Caller: string

  Caller->>run_index: classifyTaskType()
  run_index-->>Caller: TaskType
```

## 関数

### extractKeywords

```typescript
extractKeywords(text: string): string[]
```

テキストからキーワードを抽出します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `string[]`

### classifyTaskType

```typescript
classifyTaskType(task: string, summary: string): TaskType
```

キーワードに基づいてタスクの種類を分類する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| task | `string` | はい |
| summary | `string` | はい |

**戻り値**: `TaskType`

### extractFiles

```typescript
extractFiles(text: string): string[]
```

テキストからファイルパスを抽出する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `string[]`

### indexSubagentRun

```typescript
indexSubagentRun(run: {
    runId: string;
    agentId: string;
    task: string;
    summary: string;
    status: "completed" | "failed";
    startedAt: string;
    finishedAt: string;
  }): IndexedRun
```

サブエージェントの実行記録からインデックスを作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| run | `object` | はい |
| &nbsp;&nbsp;↳ runId | `string` | はい |
| &nbsp;&nbsp;↳ agentId | `string` | はい |
| &nbsp;&nbsp;↳ task | `string` | はい |
| &nbsp;&nbsp;↳ summary | `string` | はい |
| &nbsp;&nbsp;↳ status | `"completed" | "failed"` | はい |
| &nbsp;&nbsp;↳ startedAt | `string` | はい |
| &nbsp;&nbsp;↳ finishedAt | `string` | はい |

**戻り値**: `IndexedRun`

### indexTeamRun

```typescript
indexTeamRun(run: {
    runId: string;
    teamId: string;
    task: string;
    summary: string;
    status: "completed" | "failed";
    startedAt: string;
    finishedAt: string;
  }): IndexedRun
```

チーム実行レコードからインデックスを作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| run | `object` | はい |
| &nbsp;&nbsp;↳ runId | `string` | はい |
| &nbsp;&nbsp;↳ teamId | `string` | はい |
| &nbsp;&nbsp;↳ task | `string` | はい |
| &nbsp;&nbsp;↳ summary | `string` | はい |
| &nbsp;&nbsp;↳ status | `"completed" | "failed"` | はい |
| &nbsp;&nbsp;↳ startedAt | `string` | はい |
| &nbsp;&nbsp;↳ finishedAt | `string` | はい |

**戻り値**: `IndexedRun`

### buildRunIndex

```typescript
buildRunIndex(cwd: string): RunIndex
```

Build the complete run index from storage files.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `RunIndex`

### getRunIndexPath

```typescript
getRunIndexPath(cwd: string): string
```

ランインデックスのファイルパスを取得する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `string`

### loadRunIndex

```typescript
loadRunIndex(cwd: string): RunIndex | null
```

ディスクから実行インデックスを読み込む

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `RunIndex | null`

### saveRunIndex

```typescript
saveRunIndex(cwd: string, index: RunIndex): void
```

実行インデックスを保存する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| index | `RunIndex` | はい |

**戻り値**: `void`

### getOrBuildRunIndex

```typescript
getOrBuildRunIndex(cwd: string, maxAgeMs: number): RunIndex
```

実行インデックスを取得または構築

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| maxAgeMs | `number` | はい |

**戻り値**: `RunIndex`

### searchRuns

```typescript
searchRuns(index: RunIndex, query: string, options: SearchOptions): SearchResult[]
```

クエリに一致する実行を検索します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `RunIndex` | はい |
| query | `string` | はい |
| options | `SearchOptions` | はい |

**戻り値**: `SearchResult[]`

### findSimilarRuns

```typescript
findSimilarRuns(index: RunIndex, task: string, limit: number): SearchResult[]
```

タスク説明に基づき類似の過去の実行を検索

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `RunIndex` | はい |
| task | `string` | はい |
| limit | `number` | はい |

**戻り値**: `SearchResult[]`

### getRunsByType

```typescript
getRunsByType(index: RunIndex, taskType: TaskType): IndexedRun[]
```

タスクタイプに対応する実行を取得する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `RunIndex` | はい |
| taskType | `TaskType` | はい |

**戻り値**: `IndexedRun[]`

### getSuccessfulPatterns

```typescript
getSuccessfulPatterns(index: RunIndex, taskType: TaskType, limit: number): IndexedRun[]
```

指定したタスクタイプの成功したパターンを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `RunIndex` | はい |
| taskType | `TaskType` | はい |
| limit | `number` | はい |

**戻り値**: `IndexedRun[]`

## インターフェース

### IndexedRun

```typescript
interface IndexedRun {
  runId: string;
  source: "subagent" | "agent-team";
  agentId?: string;
  teamId?: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  keywords: string[];
  taskType: TaskType;
  files: string[];
  timestamp: string;
  successPattern?: string;
  failurePattern?: string;
}
```

抽出されたキーワードとタグを持つインデックス化された実行レコード

### RunIndex

```typescript
interface RunIndex {
  version: number;
  lastUpdated: string;
  runs: IndexedRun[];
  keywordIndex: Record<string, string[]>;
  taskTypeIndex: Record<TaskType, string[]>;
}
```

実行インデックスの構造。

### SearchOptions

```typescript
interface SearchOptions {
  limit?: number;
  status?: "completed" | "failed";
  taskType?: TaskType;
  minKeywordMatch?: number;
}
```

インデックス検索のオプション

### SearchResult

```typescript
interface SearchResult {
  run: IndexedRun;
  score: number;
  matchedKeywords: string[];
}
```

検索結果と関連性スコア

## 型定義

### TaskType

```typescript
type TaskType = | "code-review"
  | "bug-fix"
  | "feature-implementation"
  | "refactoring"
  | "research"
  | "documentation"
  | "testing"
  | "architecture"
  | "analysis"
  | "optimization"
  | "security"
  | "configuration"
  | "unknown"
```

タスクの種類を表す型

---
*自動生成: 2026-02-18T07:17:30.477Z*
