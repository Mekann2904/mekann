---
title: 拡張機能一覧
category: user-guide
audience: daily-user
last_updated: 2026-02-11
tags: [extensions, overview]
related: [./02-question.md, ./08-subagents.md, ./09-agent-teams.md]
---

# 拡張機能一覧

> パンくず: [Home](../../README.md) > [User Guide](./) > 拡張機能一覧

pi拡張機能コレクションで利用可能なすべての拡張機能の概要です。

## カテゴリ別一覧

### コア拡張機能

| 拡張機能 | 説明 | 詳細 |
|---------|------|------|
| **question** | インタラクティブUIでユーザー選択 | [→](./02-question.md) |
| **rsa_solve** | 推論スケーリング | [→](./03-rsa-solve.md) |
| **loop_run** | 自律ループ実行 | [→](./04-loop-run.md) |
| **fzf** | Fuzzy finder統合 | [→](./05-fzf.md) |
| **abbr** | 略語管理 | [→](./06-abbr.md) |

### オーケストレーション

| 拡張機能 | 説明 | 詳細 |
|---------|------|------|
| **plan_*** | 計画管理とタスク追跡 | [→](./07-plan.md) |
| **subagent_*** | サブエージェント | [→](./08-subagents.md) |
| **agent_team_*** | エージェントチーム | [→](./09-agent-teams.md) |
| **ul-dual-mode** | デュアルモード強制実行 | [→](./10-ul-dual-mode.md) |

### ユーティリティ

| 拡張機能 | 説明 | 詳細 |
|---------|------|------|
| **usage-tracker** | LLM使用状況の追跡 | [→](./11-utilities.md) |
| **agent-usage-tracker** | 拡張機能の使用統計 | [→](./11-utilities.md) |
| **context-dashboard** | コンテキスト使用量ダッシュボード | [→](./11-utilities.md) |
| **agent-idle-indicator** | エージェント実行状態の表示 | [→](./11-utilities.md) |
| **kitty-integration** | kittyターミナル連携 | [→](./11-utilities.md) |

## クイックリファレンス

### question - ユーザー選択UI

```typescript
{
  "tool": "question",
  "input": {
    "questions": [
      {
        "question": "どの操作を実行しますか？",
        "header": "操作選択",
        "options": [
          { "label": "A", "description": "説明" }
        ]
      }
    ]
  }
}
```

### rsa_solve - 推論スケーリング

```bash
/rsa 問題を解いてください
/rsa --n 8 --k 4 --t 5 問題を解いてください
```

### loop_run - 自律ループ

```typescript
{
  "tool": "loop_run",
  "input": {
    "task": "繰り返すタスク"
  }
}
```

### fzf - ファジーファインダー

```typescript
{
  "tool": "fzf",
  "input": {
    "type": "files",
    "pattern": "*.ts"
  }
}
```

### subagent - サブエージェント

```typescript
{
  "tool": "subagent_run",
  "input": {
    "task": "タスク内容"
  }
}
```

### agent_team - エージェントチーム

```typescript
{
  "tool": "agent_team_run",
  "input": {
    "task": "タスク内容"
  }
}
```

## 使用パターン

### ユーザー入力が必要な場合

**question**を使用して対話的に選択を受け取ります。

```typescript
question
{
  "questions": [
    {
      "question": "どのファイルを編集しますか？",
      "header": "ファイル選択",
      "options": [...]
    }
  ]
}
```

### 複雑な推論が必要な場合

**rsa_solve**を使用して推論をスケーリングします。

```bash
/rsa この複雑な問題を解いてください
```

### 反復的なタスクが必要な場合

**loop_run**を使用して自律的にタスクを実行します。

```typescript
loop_run
{
  "task": "議論を繰り返して合意を形成してください",
  "maxIterations": 5
}
```

### 専門家が必要な場合

**subagent**または**agent_team**を使用して専門家に委譲します。

```typescript
subagent_run
{
  "task": "コードレビューを実施してください",
  "subagentId": "reviewer"
}
```

### 並列実行が必要な場合

**agent_team_run_parallel**を使用して複数のチームを並列実行します。

```typescript
agent_team_run_parallel
{
  "task": "複数の調査を並列で実行してください"
}
```

## 次のステップ

- [question](./02-question.md) - インタラクティブUIの詳細
- [subagents](./08-subagents.md) - サブエージェントの詳細
- [agent-teams](./09-agent-teams.md) - エージェントチームの詳細

---

## 関連トピック

- [Getting Started](../01-getting-started/) - インストールと初回使用
- [Developer Guide](../03-development/) - 拡張機能の開発

## 次のトピック

[ → question拡張機能](./02-question.md)
