---
title: 初回ステップ
category: getting-started
audience: new-user
last_updated: 2026-02-11
tags: [tutorial, basic-operations]
related: [./01-quick-start.md, ./02-installation.md]
---

# 初回ステップ

> パンくず: [Home](../../README.md) > [Getting Started](./) > 初回ステップ

インストールが完了したら、最初の操作を試しましょう。

## piの起動

### 基本実行

```bash
pi
```

対話モードが開始します。ここで自然言語でタスクを指示できます。

### 初期プロンプト付きで開始

```bash
pi "現在のディレクトリ構造を分析してください"
```

### モデルとプロバイダーの指定

```bash
pi --model gpt-4o-mini --provider openai
```

### 思考レベルの設定

```bash
pi --thinking high
```

## 拡張機能の確認

pi起動時に以下の通知が表示されます：

```
質問機能が読み込まれました • 使用例: "質問して選択させて"
Loop extension loaded (/loop, loop_run)
fzf統合拡張が読み込まれました
Plan Extension loaded
Subagent extension loaded
Agent team extension loaded
UL Dual-Orchestration Mode loaded (ul prefix)
Agent usage tracker loaded (/agent-usage)
```

### 利用可能なツールを確認

```bash
/tools
```

すべての利用可能なツールとコマンドが表示されます。

## 最初のタスクを実行

### タスク1: ファイルの分析

```
現在のディレクトリのファイル一覧を表示し、各ファイルの目的を説明してください
```

piが現在のディレクトリを分析し、各ファイルについて説明します。

### タスク2: question拡張機能の使用

```
どの言語でドキュメントを作成するべきか、ユーザーに選択させてください
```

piが対話UIを表示し、ユーザーに選択肢を提示します。

### タスク3: subagentの使用

```
subagentを使って、README.mdの要約を作成してください
```

サブエージェントがREADME.mdを読み込み、要約を作成します。

## ホットリロード

拡張機能を編集した後、以下で再読み込みできます：

```bash
# pi内でreloadコマンド
/reload

# またはpiを再起動
```

piはjitiを使用したランタイムTypeScript変換を行うため、変更は即座に反映されます。

## 実行モード

| モード | UI利用可能 | 拡張機能読み込み | 説明 |
|--------|-----------|-----------------|------|
| `pi` | はい | はい | インタラクティブモード（推奨） |
| `pi "prompt"` | はい | はい | 初期プロンプト付きで開始 |
| `pi -p "prompt"` | いいえ | はい | プリントモード（UIツール呼び出しでエラー） |
| `pi --no-extensions` | いいえ | いいえ | 拡張機能無効化 |

## 次のステップ

- [拡張機能一覧](../02-user-guide/) - すべての拡張機能を確認
- [question拡張機能](../02-user-guide/02-question.md) - インタラクティブUIの詳細
- [subagent拡張機能](../02-user-guide/08-subagents.md) - サブエージェントの詳細

---

## 関連トピック

- [クイックスタート](./01-quick-start.md) - 5分で始める
- [インストールガイド](./02-installation.md) - インストール手順
- [拡張機能一覧](../02-user-guide/01-extensions.md) - 利用可能な拡張機能

## 次のトピック

[ → 拡張機能一覧](../02-user-guide/01-extensions.md)
