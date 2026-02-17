---
title: Run Index
category: reference
audience: developer
last_updated: 2026-02-18
tags: [index, search, keywords, task-type]
related: [pattern-extraction, semantic-memory]
---

# Run Index

サブエージェントとチームの実行履歴から検索可能なインデックスを作成するモジュール。過去のソリューションのセマンティックおよびキーワードベースの検索を可能にする。

## 型定義

### IndexedRun

キーワードとタグが抽出されたインデックス済み実行レコード。

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

### TaskType

タスクタイプの分類。

```typescript
type TaskType =
  | "code-review"
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
  | "unknown";
```

### RunIndex

実行インデックス構造。

```typescript
interface RunIndex {
  version: number;
  lastUpdated: string;
  runs: IndexedRun[];
  keywordIndex: Record<string, string[]>; // keyword -> runIds
  taskTypeIndex: Record<TaskType, string[]>; // taskType -> runIds
}
```

### SearchOptions

インデックス検索のオプション。

```typescript
interface SearchOptions {
  limit?: number;
  status?: "completed" | "failed";
  taskType?: TaskType;
  minKeywordMatch?: number;
}
```

### SearchResult

関連性スコア付きの検索結果。

```typescript
interface SearchResult {
  run: IndexedRun;
  score: number;
  matchedKeywords: string[];
}
```

## 定数

### RUN_INDEX_VERSION

```typescript
export const RUN_INDEX_VERSION = 1;
```

## 関数

### extractKeywords

単純なヒューリスティックを使用してテキストからキーワードを抽出する。

```typescript
function extractKeywords(text: string): string[]
```

### classifyTaskType

キーワードに基づいてタスクタイプを分類する。

```typescript
function classifyTaskType(task: string, summary: string): TaskType
```

### extractFiles

テキストからファイルパスを抽出する。

```typescript
function extractFiles(text: string): string[]
```

### indexSubagentRun

サブエージェント実行レコードからインデックス済み実行を構築する。

```typescript
function indexSubagentRun(run: {
  runId: string;
  agentId: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
}): IndexedRun
```

### indexTeamRun

チーム実行レコードからインデックス済み実行を構築する。

```typescript
function indexTeamRun(run: {
  runId: string;
  teamId: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
}): IndexedRun
```

### buildRunIndex

ストレージファイルから完全な実行インデックスを構築する。

```typescript
function buildRunIndex(cwd: string): RunIndex
```

### getRunIndexPath

実行インデックスファイルのパスを取得する。

```typescript
function getRunIndexPath(cwd: string): string
```

### loadRunIndex

ディスクから実行インデックスを読み込む。

```typescript
function loadRunIndex(cwd: string): RunIndex | null
```

### saveRunIndex

実行インデックスをディスクに保存する。

```typescript
function saveRunIndex(cwd: string, index: RunIndex): void
```

### getOrBuildRunIndex

実行インデックスを取得または構築する。キャッシュされたインデックスが利用可能で最近の場合はそれを返し、そうでなければ再構築する。

```typescript
function getOrBuildRunIndex(cwd: string, maxAgeMs: number = 60000): RunIndex
```

### searchRuns

クエリに一致する実行を検索する。

```typescript
function searchRuns(
  index: RunIndex,
  query: string,
  options: SearchOptions = {}
): SearchResult[]
```

### findSimilarRuns

タスク記述に基づいて類似の過去の実行を検索する。

```typescript
function findSimilarRuns(
  index: RunIndex,
  task: string,
  limit: number = 5
): SearchResult[]
```

### getRunsByType

タスクタイプ別に実行を取得する。

```typescript
function getRunsByType(index: RunIndex, taskType: TaskType): IndexedRun[]
```

### getSuccessfulPatterns

指定されたタスクタイプの成功パターンを取得する。

```typescript
function getSuccessfulPatterns(
  index: RunIndex,
  taskType: TaskType,
  limit: number = 10
): IndexedRun[]
```
