---
title: abbr - 略語管理
category: user-guide
audience: daily-user
last_updated: 2026-02-11
tags: [abbr, abbreviation, productivity]
related: [../README.md, ./01-extensions.md]
---

# abbr - 略語管理

> パンくず: [Home](../../README.md) > [User Guide](./) > abbr

Fish shell風の略語（abbreviation）管理機能です。短いエイリアスを入力すると、自動的に完全なコマンドに展開されます。

## 概要

`abbr` 拡張機能は、頻繁に使用するコマンドを短い略語として登録し、入力時に自動展開する機能を提供します。Gitコマンドを中心としたデフォルト略語が100個以上用意されています。

### 主な機能

- **自動展開**: スペースを入力すると略語が展開される
- **永続化**: `~/.pi/abbr.json` に保存され、セッションを超えて維持
- **スラッシュコマンド管理**: 登録・一覧・削除・名前変更・確認
- **正規表現パターン**: 高度なパターンマッチング対応
- **位置指定**: コマンド先頭またはどこでも展開するかを制御可能

### デフォルト略語（Git）

最初回の使用時に、以下のGit略語が自動的に登録されます：

| 略語 | 展開内容 |
|------|---------|
| `g` | `git` |
| `ga` | `git add` |
| `gaa` | `git add --all` |
| `gco` | `git checkout` |
| `gcb` | `git checkout -b` |
| `gc` | `git commit -v` |
| `gca` | `git commit -v -a` |
| `gcam` | `git commit -a -m` |
| `gd` | `git diff` |
| `gf` | `git fetch` |
| `gp` | `git push` |
| `gl` | `git pull` |
| `gst` | `git status` |
| `glog` | `git log --oneline --decorate --graph` |

## 使用方法

### スラッシュコマンド

```bash
# 略語の一覧表示（TUI）
/abbr list

# 略語を追加
/abbr add gaa "git add --all"
/abbr add gco "git checkout"

# 略語を削除（erase/delete/removeのいずれも可）
/abbr erase gaa
/abbr delete gco
/abbr remove gst

# 略語の名前変更
/abbr rename old-name new-name

# 略語の確認
/abbr query gaa
/abbr check gaa

# ヘルプ
/abbr
```

### 自動展開の使用

```bash
# 入力:
gaa README.md

# スペースを入力すると自動展開:
git add --all README.md
```

展開が行われると、通知 `Expanded: gaa → git add --all` が表示されます。もう一度Enterを押すと展開されたコマンドが送信されます。

### ツール呼び出し

```typescript
// 一覧取得
{
  "tool": "abbr",
  "parameters": {
    "action": "list"
  }
}

// 登録
{
  "tool": "abbr",
  "parameters": {
    "action": "add",
    "name": "gaa",
    "expansion": "git add --all"
  }
}

// 削除
{
  "tool": "abbr",
  "parameters": {
    "action": "erase",
    "name": "gaa"
  }
}

// 名前変更
{
  "tool": "abbr",
  "parameters": {
    "action": "rename",
    "name": "old-name",
    "newName": "new-name"
  }
}

// 確認
{
  "tool": "abbr",
  "parameters": {
    "action": "query",
    "name": "gaa"
  }
}
```

## パラメータ

### abbr ツール

| パラメータ | 型 | 説明 | 必須 |
|-----------|------|------|------|
| `action` | string | アクション（`list`|`add`|`erase`|`rename`|`query`） | ✅ |
| `name` | string | 略語名 | `add`, `erase`, `rename`, `query` で必須 |
| `expansion` | string | 展開文字列 | `add` で必須 |
| `newName` | string | 新しい名前 | `rename` で必須 |

### 略語オブジェクト

| プロパティ | 型 | 説明 |
|-----------|------|------|
| `name` | string | 略語名 |
| `expansion` | string | 展開文字列 |
| `regex` | boolean | 正規表現パターンかどうか（予約） |
| `pattern` | string | 正規表現パターン（予約） |
| `position` | string | 展開位置（`command`|`anywhere`）（予約） |

## 使用例

### 例1: 新しい略語を追加

```bash
/abbr add dc "docker compose"
/abbr add dcd "docker compose down"
/abbr add dcu "docker compose up -d"
```

入力時に展開されます：

```bash
dcu    # → docker compose up -d
dcu --build
```

### 例2: 引用符付きの展開

```bash
# 単一引用符で囲むと含められる
/abbr add msg 'git commit -m ""'

# 二重引用符でも可
/abbr add msg "git commit -m \"\""
```

### 例3: 一覧表示

```bash
/abbr list
```

TUIで略語一覧が表示されます。`q` または `Escape` で閉じます。

```
────────────────────────────────────────
 Abbreviations 
────────────────────────────────────────

  g → git
  ga → git add
  gaa → git add --all
  gco → git checkout
  gcb → git checkout -b
  ...

  Press Escape to close
────────────────────────────────────────
```

### 例4: 削除と名前変更

```bash
# 削除
/abbr erase gaa

# 名前変更
/abbr rename old-abbr new-abbr
```

### 例5: 確認

```bash
/abbr query gaa
```

```
Yes: git add --all
```

存在しない略語：

```bash
/abbr query xyz
```

```
No
```

## 展開ルール

### 展開のタイミング

以下の条件をすべて満たす場合に展開されます：

1. 入力が `/` で始まらない（コマンドではない）
2. 入力の最初の単語が登録された略語名と一致
3. 入力にスペースが含まれる

### 展開の例

```bash
# 入力
gaa

# スペースを入力
gaa 

# 展開される
git add --all 
```

```bash
# 入力
gaa README.md

# 展開される
git add --all README.md
```

```bash
# 入力
git gaa

# 展開されない（コマンドではないため）
```

## データ保存

略語データは以下の場所に保存されます：

```
~/.pi/abbr.json
```

### JSON形式

```json
{
  "abbreviations": [
    {
      "name": "gaa",
      "expansion": "git add --all"
    },
    {
      "name": "gco",
      "expansion": "git checkout"
    }
  ]
}
```

## 予約済み略語

以下の拡張機能コマンド名は、略語名として推奨されません：

- `loop`
- `fzf`
- `abbr`
- `plan`
- `planmode`
- `subagent`
- `agent-team`
- `ulmode`

これらを略語として登録しても、スラッシュコマンドとして優先されます。

## 注意点

- 引用符で囲まれた展開内の引用符はエスケープが必要です
- 略語名はアルファベット、数字、ハイフン、アンダースコアのみ推奨
- 同じ名前の略語は上書きされます
- 空の展開文字列は保存されません

## デフォルト略語一覧（Git）

### 基本

| 略語 | 展開 |
|------|------|
| `g` | `git` |
| `ga` | `git add` |
| `gaa` | `git add --all` |
| `gapa` | `git add --patch` |
| `gau` | `git add --update` |
| `gav` | `git add --verbose` |

### ブランチ

| 略語 | 展開 |
|------|------|
| `gb` | `git branch` |
| `gba` | `git branch -a` |
| `gbd` | `git branch -d` |
| `gbD` | `git branch -D` |
| `gbr` | `git branch --remote` |

### チェックアウト

| 略語 | 展開 |
|------|------|
| `gco` | `git checkout` |
| `gcb` | `git checkout -b` |
| `gcor` | `git checkout --recurse-submodules` |
| `gsw` | `git switch` |
| `gswc` | `git switch -c` |

### コミット

| 略語 | 展開 |
|------|------|
| `gc` | `git commit -v` |
| `gca` | `git commit -v -a` |
| `gcam` | `git commit -a -m` |
| `gcmsg` | `git commit -m` |
| `gc!` | `git commit -v --amend` |

### 差分

| 略語 | 展開 |
|------|------|
| `gd` | `git diff` |
| `gds` | `git diff --staged` |
| `gdca` | `git diff --cached` |
| `gdw` | `git diff --word-diff` |

### 取得・送信

| 略語 | 展開 |
|------|------|
| `gf` | `git fetch` |
| `gfa` | `git fetch --all --prune` |
| `gfo` | `git fetch origin` |
| `gl` | `git pull` |
| `gp` | `git push` |
| `gpf` | `git push --force-with-lease` |
| `gpoat` | `git push origin --all && git push origin --tags` |

### ステータス・ログ

| 略語 | 展開 |
|------|------|
| `gst` | `git status` |
| `gss` | `git status -s` |
| `gsb` | `git status -sb` |
| `glog` | `git log --oneline --decorate --graph` |
| `glg` | `git log --stat` |
| `glol` | `git log --graph --pretty='...'` |

### スタッシュ

| 略語 | 展開 |
|------|------|
| `gsta` | `git stash push` |
| `gstp` | `git stash pop` |
| `gstl` | `git stash list` |
| `gstd` | `git stash drop` |
| `gstc` | `git stash clear` |

### その他

| 略語 | 展開 |
|------|------|
| `gsh` | `git show` |
| `gcl` | `git clone --recurse-submodules` |
| `gcp` | `git cherry-pick` |
| `gr` | `git remote` |
| `grh` | `git reset --` |
| `grhh` | `git reset --hard` |
| `gclean` | `git clean -id` |

## 関連トピック

- [拡張機能一覧](./01-extensions.md) - 全拡張機能の概要
- [fzf](./05-fzf.md) - ファイル選択機能
