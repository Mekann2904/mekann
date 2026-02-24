---
title: GitHub Agent
category: user-guide
audience: daily-user
last_updated: 2026-02-25
tags: [github, git, workflow, integration]
related: [./01-extensions.md, ./08-subagents.md, ./09-agent-teams.md]
---

# GitHub Agent

> パンくず: [Home](../../README.md) > [User Guide](../README.md) > GitHub Agent

## 概要

GitHub Agentは、AIエージェントからGitHubリポジトリを効率的に探索・操作するための統合ツール拡張機能です。GitHub CLIを介して、リポジトリ情報の取得、ファイルツリー閲覧、コンテンツ読み取り、コード検索を行う機能を提供します。

## 主な機能

- **情報取得**: リポジトリのメタデータ（Star数、言語、説明など）の取得
- **ファイルツリー**: ディレクトリ構造の階層的な閲覧
- **ファイル読み込み**: ファイル内容の取得（Base64デコード自動化）
- **検索**: コード、Issue、リポジトリの検索

## 使用方法

### リポジトリ情報の取得

リポジトリの概要情報を取得します。

```typescript
await gh_agent({
  command: "info",
  repo: "facebook/react"
});
```

**出力例**:
```
Repository: facebook/react
Stars: 218,456
Forks: 45,678
Primary Language: TypeScript
Description: React is a JavaScript library for building user interfaces
```

### ファイルツリーの探索

リポジトリのディレクトリ構造を確認します。

```typescript
await gh_agent({
  command: "tree",
  repo: "facebook/react",
  path: "src"
});
```

**出力例**:
```
src/
├── React.js
├── ReactBaseClasses.js
├── ReactChildren.js
├── ReactCompositeComponent.js
└── ...
```

パスを省略するとリポジトリのルート階層が表示されます。

```typescript
await gh_agent({
  command: "tree",
  repo: "facebook/react"
});
```

### ファイル内容の閲覧

特定のファイルの内容を取得します。

```typescript
await gh_agent({
  command: "read",
  repo: "facebook/react",
  path: "README.md"
});
```

**出力例**:
```
# React

A declarative, efficient, and flexible JavaScript library for building user interfaces.

## Features

* Declarative: React makes it painless to create interactive UIs.
...
```

### コード検索

リポジトリ内のコードを検索します。

```typescript
await gh_agent({
  command: "search",
  query: "useEffect",
  search_type: "code",
  repo: "facebook/react",
  extension: "ts",
  limit: 10
});
```

**出力例**:
```
# Search Results: "useEffect" in facebook/react

1. packages/react-reconciler/src/ReactFiberHooks.js:42
   useEffect(() => {
     ref.current = callback;
   }, [callback]);

2. packages/react-reconciler/src/ReactFiberHooks.js:128
   useEffect(() => {
     const subscription = subscribe(source);
     return () => subscription.unsubscribe();
   }, [source]);

...
```

### Issue検索

リポジトリのIssueを検索します。

```typescript
await gh_agent({
  command: "search",
  query: "performance regression",
  search_type: "issues",
  repo: "facebook/react",
  limit: 5
});
```

### リポジトリ検索

GitHub全体でリポジトリを検索します。

```typescript
await gh_agent({
  command: "search",
  query: "react hooks library",
  search_type: "repositories",
  limit: 5
});
```

## パラメータ詳細

### 共通パラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `command` | string | はい | コマンド種別: `info`, `tree`, `read`, `search` |
| `repo` | string | 条件付き | ターゲットリポジトリ (owner/name形式) |

### コマンド別パラメータ

#### `info` コマンド

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `repo` | string | はい | ターゲットリポジトリ |

#### `tree` コマンド

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `repo` | string | はい | ターゲットリポジトリ |
| `path` | string | いいえ | 参照するパス（省略時はルート） |

#### `read` コマンド

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `repo` | string | はい | ターゲットリポジトリ |
| `path` | string | はい | ファイルパス |

#### `search` コマンド

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `query` | string | はい | 検索クエリ |
| `search_type` | string | いいえ | 検索種別: `code`, `issues`, `repositories`（デフォルト: `code`） |
| `repo` | string | いいえ | 検索対象リポジトリ（特定リポジトリ内検索時） |
| `extension` | string | いいえ | ファイル拡張子フィルタ（code検索のみ） |
| `limit` | number | いいえ | 最大結果数（デフォルト: 5） |

## 使用フロー

効率的なリポジトリ探索のための推奨フロー:

```typescript
// 1. まず概要を把握
const info = await gh_agent({
  command: "info",
  repo: "facebook/react"
});

// 2. ディレクトリ構造を確認
const tree = await gh_agent({
  command: "tree",
  repo: "facebook/react"
});

// 3. 関連しそうなディレクトリをドリルダウン
const srcTree = await gh_agent({
  command: "tree",
  repo: "facebook/react",
  path: "src"
});

// 4. 特定のファイルを読む
const readme = await gh_agent({
  command: "read",
  repo: "facebook/react",
  path: "README.md"
});

// 5. 特定の機能を探す場合は検索
const searchResults = await gh_agent({
  command: "search",
  query: "useMemo",
  search_type: "code",
  repo: "facebook/react",
  extension: "ts",
  limit: 10
});
```

## 事例

### 事例1: 外部ライブラリの調査

新しいライブラリの実装を調査する場合:

```typescript
// ライブラリの概要を確認
await gh_agent({
  command: "info",
  repo: "vercel/swr"
});

// ソースコードの構造を把握
await gh_agent({
  command: "tree",
  repo: "vercel/swr",
  path: "src"
});

// コア実装を読む
await gh_agent({
  command: "read",
  repo: "vercel/swr",
  path: "src/use-swr.ts"
});

// 特定の機能の実装箇所を検索
await gh_agent({
  command: "search",
  query: "function useSWR",
  search_type: "code",
  repo: "vercel/swr",
  extension: "ts"
});
```

### 事例2: バグ報告の調査

問題が報告されているIssueを調査:

```typescript
// 関連するIssueを検索
await gh_agent({
  command: "search",
  query: "memory leak in useEffect",
  search_type: "issues",
  repo: "facebook/react",
  limit: 5
});

// Issueに関連するコードを検索
await gh_agent({
  command: "search",
  query: "cleanup effect",
  search_type: "code",
  repo: "facebook/react",
  extension: "ts"
});

// 関連するファイルを読む
await gh_agent({
  command: "read",
  repo: "facebook/react",
  path: "packages/react-reconciler/src/ReactFiberHooks.js"
});
```

### 事例3: 類似プロジェクトの調査

同種のプロジェクトを比較調査:

```typescript
// 複数のリポジトリを検索
await gh_agent({
  command: "search",
  query: "state management library",
  search_type: "repositories",
  limit: 10
});

// 各リポジトリの概要を確認
await gh_agent({
  command: "info",
  repo: "facebook/react"
});

await gh_agent({
  command: "info",
  repo: "vuejs/core"
});

await gh_agent({
  command: "info",
  repo: "sveltejs/svelte"
});
```

## 制限事項

- **GitHub CLI依存**: GitHub CLI (`gh`) がインストールされている必要があります
- **認証**: 検索機能はGitHub認証が必要です (`gh auth login` を実行してください)
- **APIレート制限**: GitHub APIのレート制限に従います
- **ファイルサイズ**: 大きなファイルの読み込みは制限される場合があります

## トラブルシューティング

### エラー: `'repo' argument is required for info command.`

**原因**: 必要なパラメータが指定されていません。

**解決策**: `repo` パラメータを `owner/name` 形式で指定してください。

```typescript
// ❌ 誤
await gh_agent({ command: "info" });

// ✅ 正
await gh_agent({ command: "info", repo: "facebook/react" });
```

### エラー: `gh: authentication required`

**原因**: GitHub CLIが認証されていません。

**解決策**: GitHub CLIで認証を行ってください。

```bash
gh auth login
```

### 検索結果が返ってこない

**原因**: 検索クエリが広すぎる、またはGitHub APIの制限。

**解決策**:
- 検索クエリをより具体的にする
- `limit` パラメータで結果数を制限する
- `repo` パラメータで特定のリポジトリ内に検索範囲を限定する

```typescript
await gh_agent({
  command: "search",
  query: "useState implementation",
  search_type: "code",
  repo: "facebook/react",
  limit: 5
});
```

## 関連トピック

- [拡張機能一覧](01-extensions.md) - すべての拡張機能の概要
- [検索ツール](15-search-tools.md) - コードベース内検索との比較
- [Gitワークフロー](../../skills/git-workflow/SKILL.md) - Git操作のスキル

## 次のトピック

[ → Enhanced Read](./22-enhanced-read.md)
