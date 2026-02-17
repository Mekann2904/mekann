---
title: Plan Mode Shared
category: reference
audience: developer
last_updated: 2026-02-18
tags: [plan-mode, shared, constants, utilities]
related: [subagents, agent-teams, plan]
---

# Plan Mode Shared

プランモード全体で共有される定数とユーティリティ。一貫したプランモード動作を保証し、重複/矛盾する定義を防ぐ。

## 型定義

### PlanModeState

プランモードの状態を表すインターフェース。

```typescript
interface PlanModeState {
  enabled: boolean;
  timestamp: number;
  checksum: string;
}
```

## 定数

### READ_ONLY_COMMANDS

プランモードで使用可能な読み取り専用コマンドのセット。

```typescript
export const READ_ONLY_COMMANDS = new Set([
  "grep", "cat", "head", "tail", "less", "more", "ls",
  "find", "du", "df", "wc", "file", "stat", "tree",
  "cd", "pwd", "env", "which", "date", "uptime",
  "awk", "jq",
]);
```

### DESTRUCTIVE_COMMANDS

即座にブロックすべき破壊的コマンドのセット。

```typescript
export const DESTRUCTIVE_COMMANDS = new Set([
  "rm", "rmdir", "mv", "cp", "touch", "mkdir", "chmod", "chown",
  "ln", "truncate", "dd", "shred", "sudo", "su", "kill", "pkill", "killall",
]);
```

### SHELL_COMMANDS

シェル起動コマンドのセット（バイパス防止のため全てブロック）。

```typescript
export const SHELL_COMMANDS = new Set([
  "bash", "sh", "zsh", "fish", "ksh", "dash",
]);
```

### GIT_READONLY_SUBCOMMANDS

Git読み取り専用サブコマンドのセット（明示的な許可リスト）。

```typescript
export const GIT_READONLY_SUBCOMMANDS = new Set([
  "status", "log", "diff", "show", "branch", "remote",
  "ls-files", "ls-tree", "rev-parse", "grep",
  "blame", "reflog", "tag", "head", "describe",
  "config",
]);
```

### GIT_WRITE_SUBCOMMANDS

Git書き込みサブコマンドのセット（明示的なブロックリスト）。

```typescript
export const GIT_WRITE_SUBCOMMANDS = new Set([
  "add", "commit", "push", "pull", "fetch", "merge",
  "rebase", "reset", "checkout", "cherry-pick", "revert",
  "init", "clone", "stash", "apply", "am", "rm", "mv",
]);
```

### WRITE_BASH_COMMANDS

パッケージマネージャーコマンドのセット（複雑すぎるため全てブロック）。

```typescript
export const WRITE_BASH_COMMANDS = new Set([
  "npm", "yarn", "pnpm", "pip", "pip3", "poetry", "cargo", "composer",
  "apt", "apt-get", "yum", "dnf", "brew", "pacman",
]);
```

### PLAN_MODE_POLICY

プランモードのポリシーテキスト。

```typescript
export const PLAN_MODE_POLICY: string;
```

### PLAN_MODE_WARNING

サブエージェント/チームプロンプト用の簡易プランモード警告。

```typescript
export const PLAN_MODE_WARNING: string;
```

## 関数

### isBashCommandAllowed

Bashコマンドがプランモードで許可されているかを確認する。

複層的なチェックを実装:
1. 出力リダイレクトのチェック
2. 書き込みコマンドを含むパイプラインのチェック
3. サブシェルとコマンド置換のチェック
4. 明示的なシェル起動のチェック
5. 最初の単語を書き込みコマンドリストと照合
6. 最初の単語が読み取り専用許可リストにあるか確認

```typescript
function isBashCommandAllowed(command: string): boolean
```

### isPlanModeActive

プランモードがアクティブかどうかを確認する。

```typescript
function isPlanModeActive(): boolean
```

### calculateChecksum

プランモード状態の検証用チェックサムを計算する。

```typescript
function calculateChecksum(state: Omit<PlanModeState, 'checksum'>): string
```

### validatePlanModeState

プランモード状態のチェックサムを検証する。

```typescript
function validatePlanModeState(state: PlanModeState): boolean
```

### createPlanModeState

チェックサム付きの新しいプランモード状態を作成する。

```typescript
function createPlanModeState(enabled: boolean): PlanModeState
```
