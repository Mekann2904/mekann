---
title: Pattern Extraction
category: reference
audience: developer
last_updated: 2026-02-18
tags: [pattern, extraction, memory, learning]
related: [run-index, semantic-memory]
---

# Pattern Extraction

パターン抽出モジュール。実行履歴から再利用可能なパターンを抽出し、学習を支援する。成功/失敗パターンとタスク固有のアプローチを特定する。

## 型定義

### ExtractedPattern

抽出されたパターンを表すインターフェース。

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

### PatternExample

パターンの実行例を表すインターフェース。

```typescript
interface PatternExample {
  runId: string;
  task: string;
  summary: string;
  timestamp: string;
}
```

### PatternStorage

パターンストレージ構造。

```typescript
interface PatternStorage {
  version: number;
  lastUpdated: string;
  patterns: ExtractedPattern[];
  patternsByTaskType: Record<TaskType, string[]>;
}
```

### RunData

パターン抽出用の実行データ。

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

## 定数

### PATTERN_STORAGE_VERSION

```typescript
export const PATTERN_STORAGE_VERSION = 1;
```

## 関数

### extractPatternFromRun

単一の実行からパターンを抽出する。

```typescript
function extractPatternFromRun(run: RunData): ExtractedPattern | null
```

### getPatternStoragePath

パターンストレージファイルのパスを取得する。

```typescript
function getPatternStoragePath(cwd: string): string
```

### loadPatternStorage

ディスクからパターンストレージを読み込む。

```typescript
function loadPatternStorage(cwd: string): PatternStorage
```

### savePatternStorage

パターンストレージをディスクに保存する。

```typescript
function savePatternStorage(cwd: string, storage: PatternStorage): void
```

### addRunToPatterns

実行をパターンストレージに追加する。類似パターンが存在する場合はマージする。

```typescript
function addRunToPatterns(cwd: string, run: RunData): void
```

### extractAllPatterns

ストレージ内の全実行からパターンを抽出する。

```typescript
function extractAllPatterns(cwd: string): PatternStorage
```

### getPatternsForTaskType

特定のタスクタイプのパターンを取得する。

```typescript
function getPatternsForTaskType(
  cwd: string,
  taskType: TaskType,
  patternType?: "success" | "failure" | "approach"
): ExtractedPattern[]
```

### getTopSuccessPatterns

上位の成功パターンを取得する。

```typescript
function getTopSuccessPatterns(
  cwd: string,
  limit: number = 10
): ExtractedPattern[]
```

### getFailurePatternsToAvoid

回避すべき失敗パターンを取得する。

```typescript
function getFailurePatternsToAvoid(
  cwd: string,
  taskType?: TaskType
): ExtractedPattern[]
```

### findRelevantPatterns

タスク記述に関連するパターンを検索する。

```typescript
function findRelevantPatterns(
  cwd: string,
  taskDescription: string,
  limit: number = 5
): ExtractedPattern[]
```
