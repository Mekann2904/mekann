---
title: Ralph Loop
category: reference
audience: developer
last_updated: 2026-03-10
tags: [ralph-loop, orchestration, workflow, ralph-wiggum]
related:
  - .pi/lib/ralph-loop.ts
  - .pi/extensions/ralph-loop.ts
  - docs/02-user-guide/04-loop-run.md
---

# Ralph Loop

Ralph Loopは、fresh processを反復起動しつつ状態をファイルベースで管理する最小オーケストレーションシステムです。

**Ralph Wiggum Technique**（https://ghuntley.com/ralph-wiggum/）に基づき設計されています。

## 概要

Ralph Loopは以下の特徴を持ちます：

- **File-based shared state**: `IMPLEMENTATION_PLAN.md` を中心に状態を永続化
- **Branch-aware archiving**: ブランチ変更時に自動的に状態をアーカイブ
- **Fresh process execution**: 各イテレーションで新しいプロセスを起動
- **Three loop modes**: `build` / `plan` / `plan-work`
- **Scoped planning**: `plan-work` で branch ごとの作業スコープを扱える
- **Backpressure control**: ビルド・テストの並列数制御（Ralph記事の重要概念）
- **Placeholder detection**: 簡易実装・プレースホルダーの検出
- **Search before change**: 未実装断定禁止フロー
- **Acceptance-driven prompts**: task に required tests を持たせる前提を prompt に組み込む

## アーキテクチャ

```
.pi/ralph/
├── prd.json          # タスク定義とブランチ情報
├── progress.txt      # 進捗ログ
├── IMPLEMENTATION_PLAN.md  # 優先順位付き実装計画
├── AGENTS.md         # ビルド・実行方法の説明（Ralph記事: AGENTS.md）
├── PROMPT_plan.md    # planning 用 prompt
├── PROMPT_build.md   # building 用 prompt
├── PROMPT_plan_work.md # scoped planning 用 prompt
├── search-log.json   # 検索ログ（未実装断定の根拠記録）
├── .last-branch      # 前回のブランチ名
├── specs/            # 仕様書ディレクトリ（実体は .pi/ralph/specs/*）
└── archive/          # アーカイブディレクトリ
    └── YYYY-MM-DD-branch-name/
        ├── prd.json
        └── progress.txt
```

## Ralph Wiggum Technique の実装状況

| 記事の概念 | 実装状況 | 説明 |
|-----------|---------|------|
| `IMPLEMENTATION_PLAN.md` | 実装済み | 優先順位付きTODOリスト |
| `AGENTS.md` | 実装済み | ビルド・実行方法の説明 |
| `.pi/ralph/specs/` | 実装済み | 仕様書ディレクトリ |
| バックプレッシャー制御 | 実装済み | ビルド/テストの並列数制限 |
| プレースホルダー検出 | 実装済み | TODO/FIXME/placeholder検出 |
| 未実装断定禁止 | 実装済み | 検索ログ機能 |
| コンテキスト使用量監視 | 実装済み | 出力サイズ制限（50KB） |
| 1ループ1タスク | 実装済み | プロンプトテンプレートに記載 |
| plan/build 二相 | 実装済み | mode で prompt を切り替える |
| plan-work scoped planning | 実装済み | `${WORK_SCOPE}` を prompt に注入する |
| acceptance-driven backpressure | 実装済み | required tests を plan/build prompt に明示 |

## API Reference

### Core Library (.pi/lib/ralph-loop.ts)

#### `initRalphLoop(options)`

Ralph Loopを初期化し、必要なファイルを作成します。

```typescript
import { initRalphLoop } from "./lib/ralph-loop.js";

const result = initRalphLoop({
  cwd: process.cwd(),
  runtime: "pi", // "pi" | "amp" | "claude"
  mode: "build", // "build" | "plan" | "plan-work"
  stateDir: ".pi/ralph", // オプション
  force: false, // 既存ファイルを上書きする場合はtrue
});

console.log(result.message);
```

#### `inspectRalphLoop(options)`

現在の状態を確認し、ブランチ変更を検出してアーカイブを実行します。

```typescript
import { inspectRalphLoop } from "./lib/ralph-loop.js";

const status = inspectRalphLoop({ cwd: process.cwd() });

console.log(status.activeBranch);   // 現在のブランチ
console.log(status.previousBranch); // 前回のブランチ
console.log(status.archivedTo);     // アーカイブ先パス（変更時）
```

#### `runRalphLoop(options)`

Ralph Loopを実行し、COMPLETEシグナルまたは最大イテレーション数に達するまで反復します。

```typescript
import { runRalphLoop } from "./lib/ralph-loop.js";

const result = await runRalphLoop({
  cwd: process.cwd(),
  runtime: "pi",
  mode: "build",
  maxIterations: 10,
  sleepMs: 2000, // イテレーション間の待機時間（ms）
});

console.log(result.completed);    // true if COMPLETE signal found
console.log(result.stopReason);   // "complete" | "max_iterations"
console.log(result.iterations);   // イテレーション詳細の配列
```

### Extension Tools (.pi/extensions/ralph-loop.ts)

#### `ralph_loop_init`

Ralph Loopを初期化します。

**Parameters:**
- `runtime`: "pi" | "amp" | "claude" (optional, default: "pi")
- `mode`: "build" | "plan" | "plan-work" (optional, default: "build")
- `state_dir`: 状態ディレクトリのパス (optional, default: ".pi/ralph")
- `prompt_path`: プロンプトファイルのカスタムパス (optional)
- `force`: 既存ファイルを上書きするかどうか (optional, default: false)

**Example:**
```json
{
  "runtime": "pi",
  "mode": "build",
  "state_dir": ".pi/ralph",
  "force": false
}
```

#### `ralph_loop_status`

現在のRalph Loop状態を確認します。

**Parameters:**
- `runtime`: "pi" | "amp" | "claude" (optional)
- `mode`: "build" | "plan" | "plan-work" (optional)
- `state_dir`: 状態ディレクトリのパス (optional)
- `prompt_path`: プロンプトファイルのカスタムパス (optional)

**Returns:**
```
runtime: pi
mode: build
branch: feature/my-branch
state_dir: /path/to/.pi/ralph
prd: /path/to/.pi/ralph/prd.json
progress: /path/to/.pi/ralph/progress.txt
prompt: /path/to/.pi/ralph/PROMPT_build.md
prompt_plan: /path/to/.pi/ralph/PROMPT_plan.md
prompt_build: /path/to/.pi/ralph/PROMPT_build.md
prompt_plan_work: /path/to/.pi/ralph/PROMPT_plan_work.md
implementation_plan: /path/to/.pi/ralph/IMPLEMENTATION_PLAN.md
archive: /path/to/.pi/ralph/archive
previous_branch: feature/previous-branch
archived_to: /path/to/.pi/ralph/archive/2026-03-09-feature-previous-branch
prompt_exists: true
prd_exists: true
progress_exists: true
```

#### `ralph_loop_run`

Ralph Loopを実行します。

**Parameters:**
- `runtime`: "pi" | "amp" | "claude" (optional, default: "pi")
- `mode`: "build" | "plan" | "plan-work" (optional, default: "build")
- `work_scope`: plan-work で使う自然言語スコープ (optional)
- `max_iterations`: 最大イテレーション数 (optional, default: 10, max: 100)
- `sleep_ms`: イテレーション間の待機時間（ms）(optional, default: 2000, max: 60000)
- `state_dir`: 状態ディレクトリのパス (optional)
- `prompt_path`: プロンプトファイルのカスタムパス (optional)

**Example:**
```json
{
  "runtime": "pi",
  "mode": "plan",
  "max_iterations": 5,
  "sleep_ms": 1000
}
```

## Modes

### `build`

- `PROMPT_build.md` を使う
- `IMPLEMENTATION_PLAN.md` の最重要タスクを1つ実装する

### `plan`

- `PROMPT_plan.md` を使う
- 実装せず、`IMPLEMENTATION_PLAN.md` だけを更新する

### `plan-work`

- `PROMPT_plan_work.md` を使う
- `${WORK_SCOPE}` を埋め込んだ scoped plan を作る
- `main` / `master` では実行できない

## prd.json Schema

```json
{
  "branchName": "feature/my-feature",
  "title": "プロジェクトタイトル",
  "description": "プロジェクトの説明",
  "tasks": [
    {
      "id": "task-1",
      "title": "タスク名",
      "status": "pending", // "pending" | "in_progress" | "completed"
      "priority": "high"   // "high" | "medium" | "low"
    }
  ]
}
```

## Runtime Modes

- `pi`: `pi -p <prompt>`
- `amp`: stdin 経由で prompt を渡す
- `claude`: stdin 経由で prompt を渡す

## Branch Archiving

ブランチが変更されると、Ralph Loopは自動的に以下を実行します：

1. 前回のブランチ名を`.last-branch`から読み込む
2. ブランチが変更されていれば、現在の状態をアーカイブ
3. アーカイブ先: `.pi/ralph/archive/YYYY-MM-DD-branch-name/`
4. `progress.txt` と `IMPLEMENTATION_PLAN.md` を新しいブランチ向けに初期化

## Completion Signal

エージェントは出力に`COMPLETE`という文字列を含めることで、ループを正常終了させることができます。

## Error Handling

### Missing prd.json

```
prd.json が見つかりません: /path/to/.pi/ralph/prd.json

Ralph Loop を開始するには、以下のコマンドで初期化してください:

  ralph_loop_init を実行
```

### Missing prompt file

```
プロンプトファイルが見つかりません: /path/to/.pi/ralph/PROMPT_build.md

Ralph Loop を開始するには、以下のコマンドで初期化してください:

  ralph_loop_init を実行
```

## Testing

### Unit Tests

```bash
# Core library tests
npm test -- .pi/tests/lib/ralph-loop.test.ts

# Extension tests
npm test -- .pi/tests/extensions/ralph-loop.test.ts

# Legacy unit tests
npm test -- tests/unit/lib/ralph-loop.test.ts
```

### Test Coverage

- `initRalphLoop`: 初期化、上書き制御、カスタム内容
- `inspectRalphLoop`: 状態確認、ブランチ変更検出、アーカイブ
- `runRalphLoop`: イテレーション、COMPLETEシグナル、エラーハンドリング
- Extension tools: ツール登録、パラメータ処理、実行フロー

## Implementation Notes

### spawnLoopCommand Bug Fix

`spawnLoopCommand`関数は、`input.executable`と`input.args`が提供された場合はそれらを使用し、そうでない場合は`buildRuntimeCommand`によるフォールバックを使用します：

```typescript
const runtimeCommand = buildRuntimeCommand(input.runtime, input.prompt);
const executable = input.executable || runtimeCommand.executable;
const args = input.args.length > 0 ? input.args : runtimeCommand.args;
const stdinText = input.args.length > 0 ? undefined : runtimeCommand.stdinText;
```

これにより、カスタム実行可能ファイルと引数の指定が可能になりました。

## Backpressure Control (バックプレッシャー制御)

Ralph記事の重要な概念: "You may use up to 500 parallel subagents for all operations but only 1 subagent for build/tests."

### SubagentConfig

```typescript
interface SubagentConfig {
  maxParallelExplore: number;    // 探索・検索の最大並列数（デフォルト: 100）
  maxParallelImplement: number;  // 実装の最大並列数（デフォルト: 10）
  maxParallelBuild: number;      // ビルドの最大並列数（デフォルト: 1）
  maxParallelTest: number;       // テストの最大並列数（デフォルト: 1）
  maxParallelReview: number;     // レビューの最大並列数（デフォルト: 3）
  backpressureTypes: Array<"explore" | "build" | "test" | "lint">;
  rateLimitMs?: number;          // レート制限（ミリ秒）
}
```

### 使用例

```typescript
import { runRalphLoop, DEFAULT_SUBAGENT_CONFIG } from "./lib/ralph-loop.js";

const result = await runRalphLoop({
  cwd: process.cwd(),
  subagentConfig: {
    ...DEFAULT_SUBAGENT_CONFIG,
    maxParallelBuild: 1,  // ビルドは直列
    maxParallelTest: 1,   // テストも直列
    maxParallelExplore: 500,  // 探索は大量並列
  },
});
```

## Placeholder Detection (プレースホルダー検出)

Ralph記事: "DO NOT IMPLEMENT PLACEHOLDER OR SIMPLE IMPLEMENTATIONS."

### デフォルト検出パターン

| パターン名 | 正規表現 | 重大度 |
|-----------|---------|--------|
| TODO_COMMENT | `//\s*TODO:` | warning |
| FIXME_COMMENT | `//\s*FIXME:` | warning |
| PLACEHOLDER_KEYWORD | `placeholder` | error |
| SIMPLE_IMPLEMENTATION | `simple\s+implementation` | warning |
| NOT_IMPLEMENTED | `throw\s+new\s+Error\s*\(\s*["']Not implemented` | error |
| STUB_FUNCTION | `//\s*stub` | warning |

### 使用例

```typescript
import { detectPlaceholders, DEFAULT_PLACEHOLDER_PATTERNS } from "./lib/ralph-loop.js";

const result = detectPlaceholders(
  sourceCode,
  "path/to/file.ts",
  DEFAULT_PLACEHOLDER_PATTERNS
);

console.log(result.errors);    // エラーメッセージ
console.log(result.warnings);  // 警告メッセージ
console.log(result.detected);  // 検出されたパターン
```

## Search Before Change (未実装断定禁止)

Ralph記事: "Before making changes search codebase (don't assume an item is not implemented)."

### 検索ログ機能

```typescript
import { logSearchEntry, logNotImplementedReason } from "./lib/ralph-loop.js";

// 検索実行を記録
logSearchEntry({
  timestamp: new Date().toISOString(),
  query: "authentication",
  type: "code",
  resultsFound: 3,
  filesChecked: ["src/auth.ts", "src/middleware.ts"],
}, searchLogPath);

// 未実装と判断した理由を記録
logNotImplementedReason(
  "JWT authentication",
  "auth.tsにJWT実装がないことを確認",
  ["src/auth.ts", "src/lib/"],
  searchLogPath
);
```

## Context Usage Monitor (コンテキスト使用量監視)

Ralph記事の出力サイズ制限（50KB）を実装:

```typescript
interface ContextUsageMonitor {
  maxOutputBytes: number;       // 出力サイズ制限（デフォルト: 50KB）
  warnThresholdRatio: number;   // 警告閾値（デフォルト: 0.8）
  truncateMessage: string;      // 切り捨て時のメッセージ
}
```
