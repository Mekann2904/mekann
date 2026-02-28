---
title: self-improvement-pipeline
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# self-improvement-pipeline

## 概要

`self-improvement-pipeline` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:child_process': execSync
// from 'node:fs': existsSync, mkdirSync, writeFileSync
// from 'node:path': join
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from './self-improvement-dev-analyzer.js': DEV_PERSPECTIVE_TRANSLATIONS, analyzeCodeFromPerspective, PerspectiveName, ...
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `runPreCommitAnalysis` | Pre-commit分析を実行する |
| 関数 | `runPostCommitAnalysis` | Post-commit分析を実行する |
| 関数 | `generateReviewAnalysis` | PRレビュー用分析を生成する |
| 関数 | `getHighRiskPatterns` | 高リスクパターンの一覧を取得する（デバッグ用） |
| インターフェース | `PreCommitAnalysisResult` | Pre-commit分析結果 |
| インターフェース | `PostCommitAnalysisResult` | Post-commit分析結果 |

## 図解

### クラス図

```mermaid
classDiagram
  class PreCommitAnalysisResult {
    <<interface>>
    +timestamp: string
    +files: string
    +riskLevel: low_medium_high
    +perspectives: perspective_string
    +shouldBlock: boolean
  }
  class PostCommitAnalysisResult {
    <<interface>>
    +commitHash: string
    +commitMessage: string
    +timestamp: string
    +analyses: Array_perspective_P
  }
  class HighRiskPattern {
    <<interface>>
    +pattern: RegExp
    +risk: string
    +perspective: PerspectiveName
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[self-improvement-pipeline]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    self_improvement_dev_analyzer["self-improvement-dev-analyzer"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  ensureAnalysisDir["ensureAnalysisDir()"]
  generateReviewAnalysis["generateReviewAnalysis()"]
  getHighRiskPatterns["getHighRiskPatterns()"]
  runGitCommand["runGitCommand()"]
  runPostCommitAnalysis["runPostCommitAnalysis()"]
  runPreCommitAnalysis["runPreCommitAnalysis()"]
  generateReviewAnalysis --> runGitCommand
  runPostCommitAnalysis --> ensureAnalysisDir
  runPostCommitAnalysis --> runGitCommand
  runPreCommitAnalysis --> ensureAnalysisDir
  runPreCommitAnalysis --> runGitCommand
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant self_improvement_pipeline as "self-improvement-pipeline"
  participant mariozechner as "@mariozechner"
  participant self_improvement_dev_analyzer as "self-improvement-dev-analyzer"

  Caller->>self_improvement_pipeline: runPreCommitAnalysis()
  activate self_improvement_pipeline
  Note over self_improvement_pipeline: 非同期処理開始
  self_improvement_pipeline->>mariozechner: API呼び出し
  mariozechner-->>self_improvement_pipeline: レスポンス
  self_improvement_pipeline->>self_improvement_dev_analyzer: 内部関数呼び出し
  self_improvement_dev_analyzer-->>self_improvement_pipeline: 結果
  deactivate self_improvement_pipeline
  self_improvement_pipeline-->>Caller: Promise_PreCommitAna

  Caller->>self_improvement_pipeline: runPostCommitAnalysis()
  activate self_improvement_pipeline
  self_improvement_pipeline-->>Caller: Promise_PostCommitAn
  deactivate self_improvement_pipeline
```

## 関数

### runGitCommand

```typescript
runGitCommand(args: string[], cwd: string): string
```

Gitコマンドを安全に実行する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| args | `string[]` | はい |
| cwd | `string` | はい |

**戻り値**: `string`

### ensureAnalysisDir

```typescript
ensureAnalysisDir(): string
```

分析結果の保存ディレクトリを確保する

**戻り値**: `string`

### runPreCommitAnalysis

```typescript
async runPreCommitAnalysis(): Promise<PreCommitAnalysisResult>
```

Pre-commit分析を実行する

ステージングされたファイルを分析し、高リスクパターンを検出する。
結果は `.pi/analyses/` ディレクトリにJSON形式で保存される。

**重要**: この分析は「advisory only」であり、コミットをブロックしない。

**戻り値**: `Promise<PreCommitAnalysisResult>`

### runPostCommitAnalysis

```typescript
async runPostCommitAnalysis(commitHash: string): Promise<PostCommitAnalysisResult>
```

Post-commit分析を実行する

指定されたコミットの変更を7つの視座から分析し、
品質レポートを生成する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| commitHash | `string` | はい |

**戻り値**: `Promise<PostCommitAnalysisResult>`

### generateReviewAnalysis

```typescript
async generateReviewAnalysis(baseBranch: string): Promise<string>
```

PRレビュー用分析を生成する

現在のブランチとベースブランチの差分を分析し、
レビュー用のMarkdownレポートを生成する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| baseBranch | `string` | はい |

**戻り値**: `Promise<string>`

### getHighRiskPatterns

```typescript
getHighRiskPatterns(): Array<{ risk: string; perspective: string }>
```

高リスクパターンの一覧を取得する（デバッグ用）

**戻り値**: `Array<{ risk: string; perspective: string }>`

## インターフェース

### PreCommitAnalysisResult

```typescript
interface PreCommitAnalysisResult {
  timestamp: string;
  files: string[];
  riskLevel: "low" | "medium" | "high";
  perspectives: {
    perspective: string;
    warnings: string[];
    suggestions: string[];
  }[];
  shouldBlock: boolean;
}
```

Pre-commit分析結果

### PostCommitAnalysisResult

```typescript
interface PostCommitAnalysisResult {
  commitHash: string;
  commitMessage: string;
  timestamp: string;
  analyses: Array<{
    perspective: PerspectiveName;
    analysis: string;
    refactoringSuggestions: string[];
    testRecommendations: string[];
  }>;
}
```

Post-commit分析結果

### HighRiskPattern

```typescript
interface HighRiskPattern {
  pattern: RegExp;
  risk: string;
  perspective: PerspectiveName;
}
```

高リスクパターンの定義

---
*自動生成: 2026-02-28T13:55:22.615Z*
