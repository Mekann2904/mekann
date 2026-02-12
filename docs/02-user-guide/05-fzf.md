---
title: fzf - Fuzzy Finder
category: user-guide
audience: daily-user
last_updated: 2026-02-11
tags: [fzf, search, interactive]
related: [../README.md, ./01-extensions.md]
---

# fzf - Fuzzy Finder

> パンくず: [Home](../../README.md) > [User Guide](./) > fzf

## 概要

`fzf` 拡張機能は、fuzzy finderを介した対話的ファイル・ディレクトリ選択を提供します。Git管理ファイルやGitブランチの選択もサポートしています。

### 主な機能

- **ファイル選択**: プロジェクト内のファイルを対話的に選択
- **ディレクトリ選択**: ディレクトリを対話的に選択
- **Git管理ファイル選択**: `git ls-files` からファイルをフィルタリング
- **Gitブランチ選択**: Gitブランチを対話的に選択
- **カスタムリスト**: 任意のアイテムリストをfzfに渡して選択
- **.gitignore対応**: .gitignoreファイルを読み込んで除外パターンを適用
- **複数選択**: マルチ選択モード対応

---

## 使用方法

### ツールとしての実行

```typescript
// Git管理ファイルを選択（マルチ選択）
fzf({
  type: "git-files",
  mode: "multi"
})

// ディレクトリを選択
fzf({
  type: "directories",
  recursive: true,
  useGitignore: true
})

// カスタムアイテムリスト
fzf({
  type: "list",
  items: [
    { value: "option1", label: "Option 1", description: "First option" },
    { value: "option2", label: "Option 2", description: "Second option" }
  ]
})

// シンプルな文字列配列
fzf({
  type: "list",
  itemsRaw: ["item1", "item2", "item3"]
})

// ファイルをパターンでフィルタリング
fzf({
  type: "files",
  pattern: "*.ts",
  recursive: true
})

// Gitブランチを選択
fzf({
  type: "git-branches"
})
```

### スラッシュコマンド

```bash
# Git管理ファイルの選択（デフォルト: マルチ選択）
/fzf

# ヒント: エディタに選択結果が貼り付けられます
```

---

## パラメータ

### fzf ツール

| パラメータ | タイプ | 必須 | デフォルト | 説明 |
|-----------|--------|------|-----------|------|
| `type` | enum | ✅ | - | 選択対象の種類（files/directories/list/git-files/git-branches） |
| `mode` | enum | ❌ | "single" | 選択モード（single/multi） |
| `items` | FzfItem[] | ❌ | - | type=listの場合のアイテム一覧 |
| `itemsRaw` | string[] | ❌ | - | type=listの場合のシンプルな文字列配列 |
| `pattern` | string | ❌ | - | ファイル/ディレクトリのフィルタパターン（glob形式） |
| `recursive` | boolean | ❌ | true (files) / false (dirs) | 再帰的に検索するかどうか |
| `useGitignore` | boolean | ❌ | true | .gitignoreに従ってファイルを除外する |
| `prompt` | string | ❌ | "> " | fzfのプロンプト文字列 |
| `preview` | string | ❌ | - | fzfのプレビューコマンド |
| `header` | string | ❌ | - | fzfのヘッダー文字列 |
| `cwd` | string | ❌ | プロジェクトルート | 作業ディレクトリ |

### FzfItem 型

```typescript
interface FzfItem {
  value: string;          // 実際の値
  label?: string;         // 表示ラベル（省略時はvalue）
  description?: string;   // 説明文（省略可）
}
```

---

## 使用例

### 例1: Git管理ファイルの選択

```bash
/fzf

# fzfが起動し、Git管理されているファイルリストが表示されます
# 複数選択可能（Ctrl+Aで全選択、Ctrl+Dで全解除）
# 選択後、結果がエディタに貼り付けられます
```

### 例2: TypeScriptファイルのみを検索

```typescript
// ツールとして実行
fzf({
  type: "files",
  pattern: "*.ts",
  recursive: true
})
```

### 例3: ディレクトリ選択

```typescript
fzf({
  type: "directories",
  recursive: false,
  useGitignore: true
})
```

### 例4: カスタムオプション選択

```typescript
fzf({
  type: "list",
  items: [
    { value: "fix", label: "Fix", description: "Fix a bug" },
    { value: "feature", label: "Feature", description: "Add a new feature" },
    { value: "refactor", label: "Refactor", description: "Improve code structure" },
    { value: "docs", label: "Docs", description: "Update documentation" },
    { value: "test", label: "Test", description: "Add or update tests" }
  ],
  prompt: "Select commit type: ",
  header: "Commit Types"
})
```

### 例5: Gitブランチ選択

```typescript
fzf({
  type: "git-branches",
  prompt: "Select branch: ",
  header: "Available branches"
})
```

### 例6: シンプルなリスト

```typescript
fzf({
  type: "list",
  itemsRaw: ["Option A", "Option B", "Option C"],
  mode: "single"
})
```

---

## .gitignore パターン

拡張機能は以下のデフォルト除外パターンを持っています:

```
node_modules/**
.git/**
.DS_Store
dist/**
build/**
coverage/**
.next/**
.nuxt/**
.vscode/**
.idea/**
*.log
.pi/node_modules/**
```

また、プロジェクトの `.gitignore` ファイルからパターンを読み込み、検索時に適用します。

### パターンマッチングルール

- `**`: 複数セグメントのワイルドカード
- `*`: 単一セグメントのワイルドカード
- `?`: 単一文字
- 先頭の `!`: ネガティブパターン（現在はスキップ）

---

## fzf内でのキー操作

| キー | 説明 |
|------|------|
| `Ctrl+A` | 全選択（マルチ選択モード） |
| `Ctrl+D` | 全解除（マルチ選択モード） |
| `Ctrl+C` | キャンセル |
| `Esc` | キャンセル |
| `↑/↓` | 選択移動 |
| `Enter` | 選択確定 |

---

## カラーリング

ファイルは拡張子に基づいて色付けされます:

| 拡張子 | 色 |
|--------|-----|
| .ts | 青 |
| .js | 黄 |
| .py | 緑 |
| .md | シアン |
| .json | マゼンタ |
| .yaml/.yml | マゼンタ |
| その他 | 灰色 |

---

## 注意点

1. **fzfのインストールが必要**: システムにfzfがインストールされている必要があります
   ```bash
   # macOS
   brew install fzf

   # Linux
   sudo apt install fzf
   ```

2. **TUIとの統合**: fzf実行中はTUIが一時的に停止され、完了後に再開されます

3. **キャンセルの扱い**: EscまたはCtrl+Cでキャンセルすると、`cancelled: true` が返されます

4. **大きなプロジェクト**: ノード_modulesなどの除外パターンが適切に設定されていることを確認してください

---

## 関連トピック

- [拡張機能一覧](./01-extensions.md) - 全拡張機能の概要
