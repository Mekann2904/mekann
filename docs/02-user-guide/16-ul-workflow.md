---
title: UL Mode - Claude Code Workflow
category: user-guide
audience: daily-user
last_updated: 2026-02-25
tags: [ul-mode, workflow, claude-code, dag]
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
ul <task>                # 委任モード
ul status                # ステータス表示
ul abort                 # 中止
ul_workflow_force_claim  # 所有権を強制取得
```

---

## 所有権管理

ワークフローは作成されたpiインスタンスによって所有されます。所有権は `{sessionId}-{pid}` 形式で識別されます。

### 所有権エラー

古いpiセッションでワークフローを開始し、そのセッションが終了した場合、以下のエラーが表示されます：

```
エラー: このワークフローは他のインスタンスが所有しています。
所有者: default-34147
```

### 自動所有権取得

古い所有者のプロセスが終了している場合、新しいワークフローの開始時に所有権が自動的に取得されます：

```bash
ul 新しいタスクを開始
# 古い所有者が終了していれば、所有権を自動的に取得して続行
```

### 手動強制取得

古い所有者が終了しているにもかかわらず所有権エラーが発生する場合、手動で所有権を強制的に取得できます：

```bash
ul_workflow_force_claim()
```

**注意**: 所有者のプロセスがまだ実行中の場合、所有権を強制的に変更することはできません。

### 所有権の確認

現在の所有者を確認するには：

```bash
ul status
# 出力: "所有者: default-63664"
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

## 複雑度ベースの実行戦略

タスクの複雑度に応じて、実行戦略が自動的に選択されます。

### 複雑度判定

| 複雑度 | 条件 | 実行戦略 |
|--------|------|---------|
| **低** | 単純な変更、明確なゴール | シンプル実行 |
| **中** | 複数コンポーネント、ステップ指示あり | DAG実行推奨 |
| **高** | アーキテクチャ変更、リファクタリング | DAG実行 |

### 実行戦略の決定

```typescript
determineExecutionStrategy("ボタンを追加")
// -> { strategy: "simple", useDag: false }

determineExecutionStrategy("認証システムをリファクタリング")
// -> { strategy: "dag", useDag: true }
```

---

## ul_workflow_dag - DAGベース実行

高複雑度タスク向けのDAGベース並列実行ツール。

### 使用方法

```typescript
ul_workflow_dag({
  task: "認証システムをリファクタリング",
  maxConcurrency: 3
})
```

### 動作

1. タスク複雑度を分析
2. DAGプランを自動生成
3. 依存関係に基づいて並列実行

### 出力例

```
DAG-based UL Workflow Execution

Task: 認証システムをリファクタリング
Strategy: dag
Reason: High complexity task - DAG-based parallel execution for efficiency

Generated DAG (4 tasks, max depth: 2):
  - research [researcher]: 認証システムに関連するコードベースを調査...
  - implement [implementer] (deps: research): 認証システムをリファクタリング
  - test [tester] (deps: implement): 単体テストと統合テストを作成...
  - review [reviewer] (deps: implement): 実装をレビューし品質確認...

Execute with:
subagent_run_dag({ task: "...", maxConcurrency: 3 })
```

---

## フェーズ一覧

| フェーズ | 説明 |
|---------|------|
| `idle` | 待機中 |
| `research` | 調査フェーズ - コードベースの深い理解 |
| `plan` | 計画フェーズ - 詳細な実装計画の作成 |
| `annotate` | 注釈フェーズ - ユーザーによる計画のレビューと修正 |
| `implement` | 実装フェーズ - 計画に基づくコード実装 |
| `review` | レビューフェーズ - 実装の品質確認 |
| `completed` | 完了 |
| `aborted` | 中止 |

---

## 関連

- [Subagents](08-subagents.md)
- [Claude Code Workflow](https://docs.anthropic.com/en/docs/claude-code)
