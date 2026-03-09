---
title: Ralph Loop
category: reference
audience: developer
last_updated: 2026-03-09
tags: [ralph-loop, orchestration, workflow]
related:
  - .pi/lib/ralph-loop.ts
  - .pi/extensions/ralph-loop.ts
  - docs/02-user-guide/04-loop-run.md
---

# Ralph Loop

Ralph Loopは、fresh processを反復起動しつつ状態をファイルベースで管理する最小オーケストレーションシステムです。

## 概要

Ralph Loopは以下の特徴を持ちます：

- **File-based state management**: prd.jsonとprogress.txtで状態を永続化
- **Branch-aware archiving**: ブランチ変更時に自動的に状態をアーカイブ
- **Fresh process execution**: 各イテレーションで新しいプロセスを起動
- **Multiple runtime support**: pi, amp, claudeの3つのランタイムをサポート

## アーキテクチャ

```
.pi/ralph/
├── prd.json          # タスク定義とブランチ情報
├── progress.txt      # 進捗ログ
├── PI.md             # エージェントへのプロンプト（pi用）
├── CLAUDE.md         # エージェントへのプロンプト（claude用）
├── prompt.md         # エージェントへのプロンプト（amp用）
├── .last-branch      # 前回のブランチ名
└── archive/          # アーカイブディレクトリ
    └── YYYY-MM-DD-branch-name/
        ├── prd.json
        └── progress.txt
```

## API Reference

### Core Library (.pi/lib/ralph-loop.ts)

#### `initRalphLoop(options)`

Ralph Loopを初期化し、必要なファイルを作成します。

```typescript
import { initRalphLoop } from "./lib/ralph-loop.js";

const result = initRalphLoop({
  cwd: process.cwd(),
  runtime: "pi", // "pi" | "amp" | "claude"
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
- `state_dir`: 状態ディレクトリのパス (optional, default: ".pi/ralph")
- `prompt_path`: プロンプトファイルのカスタムパス (optional)
- `force`: 既存ファイルを上書きするかどうか (optional, default: false)

**Example:**
```json
{
  "runtime": "pi",
  "state_dir": ".pi/ralph",
  "force": false
}
```

#### `ralph_loop_status`

現在のRalph Loop状態を確認します。

**Parameters:**
- `runtime`: "pi" | "amp" | "claude" (optional)
- `state_dir`: 状態ディレクトリのパス (optional)
- `prompt_path`: プロンプトファイルのカスタムパス (optional)

**Returns:**
```
runtime: pi
branch: feature/my-branch
state_dir: /path/to/.pi/ralph
prd: /path/to/.pi/ralph/prd.json
progress: /path/to/.pi/ralph/progress.txt
prompt: /path/to/.pi/ralph/PI.md
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
- `max_iterations`: 最大イテレーション数 (optional, default: 10, max: 100)
- `sleep_ms`: イテレーション間の待機時間（ms）(optional, default: 2000, max: 60000)
- `state_dir`: 状態ディレクトリのパス (optional)
- `prompt_path`: プロンプトファイルのカスタムパス (optional)

**Example:**
```json
{
  "runtime": "pi",
  "max_iterations": 5,
  "sleep_ms": 1000
}
```

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

### pi (default)

- コマンド: `pi -p <prompt>`
- プロンプトファイル: `PI.md`

### amp

- コマンド: `amp`（stdin経由でプロンプトを渡す）
- プロンプトファイル: `prompt.md`

### claude

- コマンド: `claude`（stdin経由でプロンプトを渡す）
- プロンプトファイル: `CLAUDE.md`

## Branch Archiving

ブランチが変更されると、Ralph Loopは自動的に以下を実行します：

1. 前回のブランチ名を`.last-branch`から読み込む
2. ブランチが変更されていれば、現在の状態をアーカイブ
3. アーカイブ先: `.pi/ralph/archive/YYYY-MM-DD-branch-name/`
4. progress.txtを空にして新しいブランチ用に初期化

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
プロンプトファイルが見つかりません: /path/to/.pi/ralph/PI.md

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
