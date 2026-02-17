---
title: Startup Context Extension
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, context, session, git, readme]
related: [extensions.md, agent-runtime.md]
---

# Startup Context Extension

セッション開始時に動的なコンテキスト情報を最初のプロンプトに自動注入する拡張機能。

## 概要

この拡張機能は、piエージェントがセッション開始時に以下の情報を自動的に把握できるようにする：

- 現在の作業ディレクトリパス
- 直近10件のGitコミットメッセージ（タイトルのみ）
- README.mdの内容（フルコンテンツ）

各セクションには利用ガイダンスが付与され、エージェントがこのコンテキストを効果的に活用できるよう支援する。

## 主な機能

### コンテキスト注入

`before_agent_start`イベントで最初のプロンプト時にのみコンテキストを注入。

#### 注入される情報

| 種類 | 説明 | 用途 |
|------|------|------|
| Current Working Directory | `process.cwd()` | ファイル操作のベースパス |
| Recent Git Commits | 直近10件のコミット | 最近の変更内容の把握 |
| README.md | プロジェクト概要 | プロジェクト構造の理解 |

### システムプロンプトへの追加

コンテキストはユーザーメッセージではなく、システムプロンプトに追記される。これによりTUIには表示されず、LLMには送信される。

## エクスポート

### デフォルトエクスポート

```typescript
export default function (pi: ExtensionAPI): void
```

拡張機能の登録関数。

## イベントハンドラ

### session_start

```typescript
pi.on("session_start", async (_event, _ctx) => {
  isFirstPrompt = true;
});
```

セッション開始時に最初のプロンプトフラグをリセット。

### before_agent_start

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  if (!isFirstPrompt) return;
  // コンテキスト構築と注入
});
```

最初のプロンプト時のみコンテキストを構築し、システムプロンプトに追記して返す。

**戻り値**:
- `systemPrompt`: 元のシステムプロンプトに注入コンテキストを結合した文字列

## 内部関数

### Gitログ取得

```typescript
const gitLog = execSync(
  'git log -10 --pretty=format:"%h %s" --no-merges 2>/dev/null',
  { encoding: "utf-8", timeout: 5000, cwd }
).trim();
```

タイムアウト5秒で実行。Gitリポジトリでない場合はエラーをキャッチしてスキップ。

### README検索

以下の候補ファイルを順に探索:

1. `README.md`
2. `readme.md`
3. `README`
4. `readme`

最初に見つかったファイルの内容を使用。

## 注入されるコンテキスト形式

```markdown
# Session Startup Context

This context is automatically injected at session start to help you understand
the project's current state, recent changes, and overall structure.

## Current Working Directory
`/path/to/project`

> Use this as the base path for all file operations...

## Recent Git Commits (Last 10)
```
abc1234 Fix bug in authentication
def5678 Add new feature X
...
```

> These commits show the recent development activity...

## README.md
```markdown
# Project Name
...
```

> The README contains project overview...

---
_End of startup context._
```

## 依存関係

- `node:child_process` - Gitコマンド実行
- `node:fs` - ファイル読み込み
- `@mariozechner/pi-coding-agent` - ExtensionAPI

## エラーハンドリング

- Gitリポジトリでない場合: サイレントにスキップ
- README読み込みエラー: サイレントにスキップ
- コンテキストが空の場合: 何も注入しない

## 設定

環境変数や設定ファイルによるカスタマイズはなし。動作は固定。
