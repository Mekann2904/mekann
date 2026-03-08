---
title: UL Mode - Claude Code Workflow
category: user-guide
audience: daily-user
last_updated: 2026-03-08
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
Research (DAG並列) → Plan → [Questionで人間確認] → Implement (DAG並列) → Commit
```

| フェーズ | 実行者 | 成果物 |
|---------|--------|--------|
| Research | エージェント | research.md |
| Plan | エージェント | plan.md |
| Review | **ユーザー** | Questionによる承認または修正指示 |
| Implement | エージェント | コード変更 |
| Commit | エージェント | Git commit |

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

Research はコード棚卸しではありません。

まず、ユーザ入力を顧客要求として解釈します。

その上で、agent はビジネスアナリストとして次を整理します。

- ユーザは何を実現したいか
- 何が成功条件か
- どの制約があるか
- plan 前に何を調べるべきか

新規構築、複合技術、未知ライブラリ、表現品質が重要なタスクでは、ローカル探索だけで終えてはいけません。

この場合は web 検索を強く推奨します。

優先順位は次です。

1. 要求の解釈
2. 外部調査
3. ローカルコード確認

外部調査では、公式ドキュメント、一次情報、信頼できる技術資料を優先します。

research.md には、調べた事実だけでなく、それを plan にどう反映するかまで残します。

```
subagent_run({ subagentId: "researcher", task: "..." })
```

### 2. Plan（計画）

詳細な実装計画をplan.mdに作成。コードスニペットを含める。

plan は、顧客要求を開発実装へ翻訳した成果物です。

ユーザは同一人物ですが、ここでは

`ユーザ（顧客） -> agent（ビジネスアナリスト） -> ユーザ（開発者）`

の受け渡しを行います。

そのため plan.md では、実装手順だけでなく、要求解釈と設計判断の根拠も明示します。

```
subagent_run({ subagentId: "architect", task: "..." })
```

### 3. Review（ユーザーレビュー）

**ユーザーが主導**。`question` 拡張で承認か修正かを選ぶ。

修正したい場合は `Type something.` で修正内容を書く。

エージェントはその内容を `ul_workflow_modify_plan(...)` に渡して、再度確認を求める。

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

### 5. Commit

実装完了後は `ul_workflow_commit()` でコミット確認まで進む。

---

## コマンド

```
ul <task>                # Research → Plan → Question確認 → Implement → Commit
ul status                # ステータス表示
ul approve               # 現在フェーズの承認
ul annotate              # plan.md の注釈適用
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
  - research [researcher]: 認証要求を解釈し、必要な外部調査とコード確認を行う...
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
