---
title: Loop Extension
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, loop, autonomous, iteration, verification]
related: []
---

# Loop Extension

> パンくず: [Home](../README.md) > [Extensions](./) > Loop Extension

## 概要

Loop拡張機能は、自律的な反復実行ランナーを提供します。参照資料に基づいた実行、引用チェック、再現可能な実行ログを特徴とします。

## 機能

- 自律的なタスク反復実行
- 参照資料の注入と引用チェック
- 検証コマンドによる目標達成確認
- セマンティック停滞検出（実験的）
- JSONL形式の実行ログ

---

## 型定義

### LoopConfig

ループ実行の設定。

```typescript
interface LoopConfig {
  maxIterations: number;                              // 最大反復回数
  timeoutMs: number;                                  // 反復タイムアウト（ミリ秒）
  requireCitation: boolean;                           // 引用必須フラグ
  verificationTimeoutMs: number;                      // 検証タイムアウト
  enableSemanticStagnation?: boolean;                 // セマンティック停滞検出
  semanticRepetitionThreshold?: number;               // 類似度閾値（0-1）
}
```

### LoopIterationResult

反復実行の結果。

```typescript
interface LoopIterationResult {
  iteration: number;              // 反復番号
  latencyMs: number;              // レイテンシ（ミリ秒）
  status: LoopStatus;             // ステータス
  goalStatus: LoopGoalStatus;     // 目標ステータス
  goalEvidence: string;           // 目標達成の証拠
  verification?: LoopVerificationResult;  // 検証結果
  citations: string[];            // 引用リスト
  validationErrors: string[];     // 検証エラー
  output: string;                 // 出力
}
```

### LoopRunSummary

実行サマリー。

```typescript
interface LoopRunSummary {
  runId: string;                  // 実行ID
  startedAt: string;              // 開始時刻
  finishedAt: string;             // 終了時刻
  task: string;                   // タスク
  completed: boolean;             // 完了フラグ
  stopReason: StopReason;         // 停止理由
  iterationCount: number;         // 反復回数
  maxIterations: number;          // 最大反復回数
  referenceCount: number;         // 参照数
  goal?: string;                  // 目標
  verificationCommand?: string;   // 検証コマンド
  model: ModelInfo;               // モデル情報
  config: LoopConfig;             // 設定
  logFile: string;                // ログファイルパス
  summaryFile: string;            // サマリーファイルパス
  finalPreview: string;           // 最終出力プレビュー
  intentClassification?: IntentClassification;  // インテント分類
  semanticStagnation?: SemanticStagnation;      // セマンティック停滞情報
}
```

### LoopProgress

進捗情報。

```typescript
interface LoopProgress {
  type: "run_start" | "iteration_start" | "iteration_done" | "run_done";
  iteration?: number;
  maxIterations: number;
  status?: LoopStatus;
  latencyMs?: number;
  validationErrors?: string[];
  taskPreview?: string;
  focusPreview?: string;
  commandPreview?: string;
  summaryPreview?: string;
}
```

### LoopReference

参照情報。

```typescript
interface LoopReference {
  id: string;           // 参照ID (R1, R2, ...)
  source: string;       // ソース（ファイルパス/URL/テキスト）
  title: string;        // タイトル
  content: string;      // コンテンツ
}
```

---

## 主要関数

### runLoop(input: LoopRunInput): Promise<LoopRunOutput>

メインのループ実行関数。

```typescript
async function runLoop(input: LoopRunInput): Promise<LoopRunOutput>
```

**パラメータ**:
- `input`: ループ実行入力パラメータ

**戻り値**: サマリー、最終出力、反復結果を含む出力

### normalizeLoopConfig(overrides): NormalizedConfig

設定を正規化します。

```typescript
function normalizeLoopConfig(
  overrides: Partial<LoopConfig>,
): { ok: true; config: LoopConfig } | { ok: false; error: string }
```

### parseLoopCommand(args: string): ParsedLoopCommand

コマンドライン引数をパースします。

```typescript
function parseLoopCommand(args: string | undefined): ParsedLoopCommand
```

### loadReferences(input, signal): Promise<LoadedReferences>

参照資料を読み込みます。

```typescript
async function loadReferences(
  input: { refs: string[]; refsFile?: string; cwd: string },
  signal?: AbortSignal
): Promise<{ references: LoopReference[]; warnings: string[] }>
```

---

## ツール

### loop_run

自律的な反復ループを実行します。

**パラメータ**:
| 名前 | 型 | 必須 | 説明 |
|-----|-----|-----|------|
| task | string | はい | 実行するタスク |
| maxIterations | number | いいえ | 最大反復回数 |
| timeoutMs | number | いいえ | タイムアウト（ミリ秒） |
| verificationTimeoutMs | number | いいえ | 検証タイムアウト |
| requireCitation | boolean | いいえ | 引用必須 |
| goal | string | いいえ | 完了基準 |
| verifyCommand | string | いいえ | 検証コマンド |
| references | string[] | いいえ | 参照リスト |
| refsFile | string | いいえ | 参照ファイル |
| enableSemanticStagnation | boolean | いいえ | セマンティック停滞検出 |
| semanticRepetitionThreshold | number | いいえ | 類似度閾値 |

---

## コマンド

### /loop run

ループを実行します。

```
/loop run [--max <n>] [--timeout <ms>] [--goal <text>] [--verify <command>] [--ref <path|url|text>] <task>
```

**オプション**:
- `--max, -n`: 最大反復回数
- `--timeout`: 反復タイムアウト（ミリ秒）
- `--verify-timeout`: 検証タイムアウト
- `--goal`: 明示的な完了基準
- `--verify`: 検証コマンド
- `--ref`: 参照資料
- `--refs-file`: 参照ファイル
- `--require-citation`: 引用を必須にする
- `--no-require-citation`: 引用を必須にしない

### /loop status

最新の実行サマリーを表示します。

```
/loop status
```

### /loop help

ヘルプを表示します。

```
/loop help
```

---

## 使用例

```
# 基本的なループ実行
/loop run --max 8 Implement the parser and make all tests pass.

# 目標と検証コマンド付き
/loop run --goal "all tests pass" --verify "npm test" Implement parser updates.

# 参照資料付き
/loop run --ref ./docs/paper-notes.md --ref https://example.com/api.md Write a summary with citations.

# セマンティック停滞検出有効
/loop run --enable-semantic-stagnation Analyze the codebase patterns.
```

---

## 制限値

| パラメータ | 最小値 | 最大値 | デフォルト |
|-----------|-------|-------|----------|
| maxIterations | 1 | 16/48 | 4/6 |
| timeoutMs | 10,000 | 600,000 | 60,000/120,000 |
| verificationTimeoutMs | 1,000 | 120,000 | 60,000/120,000 |
| maxReferences | - | 24 | - |
| maxReferenceCharsPerItem | - | 8,000 | - |
| maxReferenceCharsTotal | - | 30,000 | - |

---

## ファイル出力

ループ実行は以下のファイルを生成します:

- `.pi/agent-loop/<run-id>.jsonl` - 実行ログ
- `.pi/agent-loop/<run-id>.summary.json` - サマリー
- `.pi/agent-loop/latest-summary.json` - 最新サマリーのスナップショット

---

## 関連トピック

- [Plan Extension](./plan.md) - プラン管理機能
- [Question Extension](./question.md) - ユーザー質問機能
