---
title: UL Mode - Claude Code Workflow
category: user-guide
audience: daily-user
last_updated: 2026-02-24
tags: [ul-mode, workflow, claude-code]
related: [docs/02-user-guide/08-subagents.md]
---

# UL Mode

Claude Code Workflowに基づく委任モード。調査・計画・実装を自律的に行う。

## 基本原則

> **Claudeにコードを書かせる前に、必ず文章化された計画をレビュー・承認する**

---

## フロー

```
Research → Plan → [ユーザーレビュー] → Implement
```

| フェーズ | 実行者 | 成果物 |
|---------|--------|--------|
| Research | エージェント | research.md |
| Plan | エージェント | plan.md |
| Review | **ユーザー** | 注釈付きplan.md |
| Implement | エージェント | コード変更 |

---

## 使用方法

```
ul <task>
```

例:
```
ul 通知システムにソート可能なIDを追加する
ul 認証フローのバグを修正
ul リストエンドポイントにカーソルベースのページングを追加
```

---

## 各フェーズ

### 1. Research（調査）

コードベースを**徹底的に**理解し、research.mdに文書化。

```
subagent_run({ subagentId: "researcher", task: "..." })
```

### 2. Plan（計画）

詳細な実装計画をplan.mdに作成。コードスニペットを含める。

```
subagent_run({ subagentId: "architect", task: "..." })
```

### 3. Review（ユーザーレビュー）

**ユーザーが主導**。plan.mdに注釈を追加し、エージェントが更新。

```markdown
<!-- NOTE: use drizzle:generate, not raw SQL -->
<!-- NOTE: this should be PATCH, not PUT -->
```

1-6回繰り返し可能。

### 4. Implement（実装）

計画に従って機械的に実装。

```
subagent_run({ subagentId: "implementer", task: "plan.mdを実装" })
```

---

## コマンド

```
ul <task>       # 委任モード
ul status       # ステータス表示
ul abort        # 中止
```

---

## plan.mdの構造

```markdown
# 実装計画: <タスク名>

## 目的
## 変更内容
## 手順
## 考慮事項
## Todo
- [ ] タスク1
- [ ] タスク2
```

---

## 関連

- [Subagents](08-subagents.md)
- [Claude Code Workflow](https://docs.anthropic.com/en/docs/claude-code)
