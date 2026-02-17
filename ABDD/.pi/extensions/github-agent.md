---
title: github-agent
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, github, repository, exploration]
related: []
---

# github-agent

> パンくず: [Home](../../README.md) > [Extensions](./) > github-agent

## 概要

GitHubリポジトリ探索ツール。info、tree、read、searchコマンドをサポートし、GitHubリポジトリの情報取得、ファイルツリー表示、ファイル読み込み、コード検索を行う。

## ツール

### gh_agent

GitHubリポジトリ探索ツール。

**ラベル**: GitHub Agent

**説明**: GitHub repository exploration tool. Supports info, tree, read, and search commands.

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `command` | enum | はい | コマンド（info, tree, read, search） |
| `repo` | string | いいえ | 対象リポジトリ（owner/name） |
| `path` | string | いいえ | ファイルパス（read/treeコマンド用） |
| `query` | string | いいえ | 検索クエリ |
| `search_type` | enum | いいえ | 検索タイプ（code, issues, repositories） |
| `limit` | integer | いいえ | 最大結果数（デフォルト: 5） |
| `extension` | string | いいえ | コード検索用のファイル拡張子フィルタ |

## コマンド

### info

リポジトリ情報を取得する。

**必須パラメータ**: `repo`

**使用例**:
```typescript
gh_agent({
  command: "info",
  repo: "owner/repo"
})
```

### tree

リポジトリのファイルツリーを表示する。

**必須パラメータ**: `repo`

**オプションパラメータ**: `path`

**使用例**:
```typescript
gh_agent({
  command: "tree",
  repo: "owner/repo",
  path: "src/lib"
})
```

### read

リポジトリ内のファイルを読み込む。

**必須パラメータ**: `repo`, `path`

**使用例**:
```typescript
gh_agent({
  command: "read",
  repo: "owner/repo",
  path: "README.md"
})
```

### search

コード、イシュー、リポジトリを検索する。

**必須パラメータ**: `query`

**オプションパラメータ**:
- `search_type`: 検索タイプ（code, issues, repositories）
- `limit`: 最大結果数
- `repo`: リポジトリ制限
- `extension`: ファイル拡張子フィルタ

**使用例**:
```typescript
gh_agent({
  command: "search",
  query: "function parseJson",
  search_type: "code",
  limit: 10,
  repo: "owner/repo",
  extension: "ts"
})
```

## 型定義

### GhAgentParams

ツールパラメータのTypeBoxスキーマ。

```typescript
const GhAgentParams = Type.Object({
    command: StringEnum(["info", "tree", "read", "search"] as const),
    repo: Type.Optional(Type.String({ description: "Target repository (owner/name)" })),
    path: Type.Optional(Type.String({ description: "File path for read/tree commands" })),
    query: Type.Optional(Type.String({ description: "Search query" })),
    search_type: Type.Optional(StringEnum(["code", "issues", "repositories"] as const)),
    limit: Type.Optional(Type.Integer({ description: "Max results (default: 5)" })),
    extension: Type.Optional(Type.String({ description: "File extension filter for code search" })),
});

type GhAgentArgs = Static<typeof GhAgentParams>;
```

## 実装詳細

### スクリプト実行

ツールは `github-agent/gh_agent.sh` シェルスクリプトを実行してGitHub APIにアクセスする。

```typescript
const scriptPath = path.resolve(__dirname, "github-agent/gh_agent.sh");
```

### エラーハンドリング

- 必須パラメータが不足している場合、エラーメッセージを返す
- スクリプト実行エラー（非ゼロ終了コード）の場合、エラーメッセージと標準エラー出力を返す

## 依存関係

- `node:path`: パス操作
- `node:child_process`: 子プロセス実行
- `@mariozechner/pi-coding-agent`: ExtensionAPI
- `@sinclair/typebox`: Type, Static
- `@mariozechner/pi-ai`: StringEnum

---

## 関連トピック

- [extensions](../../docs/extensions.md) - 拡張機能一覧
