---
title: UL Workflow Mode - Research-Plan-Annotate-Implement
category: user-guide
audience: daily-user
last_updated: 2026-02-23
tags: [ul-mode, workflow, research, plan, implement]
related: [docs/02-user-guide/10-ul-dual-mode.md, docs/02-user-guide/08-subagents.md]
---

# UL Workflow Mode

Research-Plan-Annotate-Implementワークフローを提供する拡張機能。コード実装前に必ず承認された計画を必要とする規律ある開発プロセスを実現します。

## 概要

このワークフローは、記事「Claude Code Workflow」のアプローチに基づいています：

> **基本原則**: Claudeにコードを書かせる前に、必ず文章化された計画をレビュー・承認する

### メリット

- **無駄な作業の防止**: 誤った前提での実装を防ぐ
- **アーキテクチャの制御**: 意思決定をユーザーがコントロール
- **トークン節約**: コードに直接移行する場合より効率的
- **高品質な結果**: 計画と実装の分離による品質向上

## フェーズ

```
RESEARCH → PLAN → ANNOTATE → IMPLEMENT → COMPLETED
```

| フェーズ | 説明 | 成果物 |
|---------|------|--------|
| RESEARCH | コードベースの深い理解 | research.md |
| PLAN | 詳細な実装計画の作成 | plan.md |
| ANNOTATE | ユーザーによる計画のレビューと修正 | 更新されたplan.md |
| IMPLEMENT | 計画に基づくコード実装 | コード変更 |

## 使用方法

### プレフィックスコマンド（推奨）

```
# ワークフローモードで実行（デフォルト）
ul 通知システムにソート可能なIDを追加する

# 高速委任モードで実行（計画承認なし）
ul fast 通知システムにソート可能なIDを追加する

# ワークフロー操作
ul status    # ステータス表示
ul approve   # 現在のフェーズを承認
ul annotate  # 注釈を適用
ul abort     # 中止
ul resume <task_id>  # 再開
```

### ツール直接呼び出し

#### 1. ワークフロー開始

```
ul_workflow_start({ task: "通知システムにソート可能なIDを追加する" })
```

または コマンド:

```
/ul-workflow-start 通知システムにソート可能なIDを追加する
```

### 2. 調査フェーズ

```
ul_workflow_research({ task: "通知システムにソート可能なIDを追加する" })
```

生成された指示に従って、`researcher`サブエージェントに調査を委任します。

調査結果は `.pi/ul-workflow/tasks/<task-id>/research.md` に保存されます。

### 3. 計画フェーズ

```
ul_workflow_plan({ task: "通知システムにソート可能なIDを追加する" })
```

`architect`サブエージェントに計画作成を委任します。

計画は `.pi/ul-workflow/tasks/<task-id>/plan.md` に保存されます。

### 4. 承認

```
ul_workflow_approve()
```

または:

```
/ul-workflow-approve
```

各フェーズの完了を承認して次へ進みます。

### 5. 注釈サイクル

計画をエディタで開いて注釈を追加:

```markdown
<!-- NOTE: これはPUTではなくPATCHで処理してください -->
[注釈]: マイグレーションにはraw SQLではなくdrizzle:generateを使用してください
```

注釈を適用:

```
ul_workflow_annotate()
```

または:

```
/ul-workflow-annotate
```

注釈サイクルは1〜6回繰り返せます。満足したら承認:

```
ul_workflow_approve()
```

### 6. 実装フェーズ

```
ul_workflow_implement()
```

`implementer`サブエージェントに実装を委任します。

### 7. 完了

```
ul_workflow_approve()
```

ワークフロー完了。

## ツール一覧

| ツール | 説明 |
|--------|------|
| `ul_workflow_start` | ワークフロー開始 |
| `ul_workflow_status` | 現在のステータス表示 |
| `ul_workflow_approve` | 現在のフェーズを承認 |
| `ul_workflow_annotate` | plan.mdの注釈を検出・適用 |
| `ul_workflow_abort` | ワークフロー中止 |
| `ul_workflow_resume` | 中止したワークフローを再開 |
| `ul_workflow_research` | 研究フェーズ実行指示生成 |
| `ul_workflow_plan` | 計画フェーズ実行指示生成 |
| `ul_workflow_implement` | 実装フェーズ実行指示生成 |

## ガード機能

### 実装前の承認必須

plan.mdが承認されていない場合、実装フェーズに進めません:

```
エラー: annotate フェーズが承認されていません。
```

### 明示的承認

各フェーズは明示的な `ul_workflow_approve()` が必要です。自動で次のフェーズへ進みません。

### 進捗の永続化

ワークフローの状態は `.pi/ul-workflow/tasks/<task-id>/status.json` に保存されます。セッションをまたいでも状態が保持されます。

## ファイル構造

```
.pi/ul-workflow/
├── tasks/
│   └── <task-id>/
│       ├── task.md          # タスク定義
│       ├── research.md      # 調査結果
│       ├── plan.md          # 実装計画
│       └── status.json      # ステータス
└── templates/
    ├── research-template.md # research.mdテンプレート
    └── plan-template.md     # plan.mdテンプレート
```

## 注釈形式

plan.mdに追加できる注釈形式:

```markdown
<!-- NOTE: 単一行の注釈 -->

<!-- NOTE:
複数行の注釈
詳細な説明を含む
-->

[注釈]: 日本語形式の注釈

<!-- ANNOTATION: 英語形式の注釈 -->
```

## ワークフロー中止・再開

### 中止

```
ul_workflow_abort()
```

または:

```
/ul-workflow-abort
```

### 再開

```
ul_workflow_resume({ task_id: "2026-02-23T12-34-56-notification-id" })
```

## ベストプラクティス

### 調査フェーズ

- 「深く」「詳細にわたって」「複雑な部分まで」という指示を使用
- 表面的な読み取りでは不十分であることを明示
- research.mdを必ずレビューして誤解を修正

### 注釈サイクル

- ドメイン知識を提供
- 誤った前提を修正
- 提案されたアプローチを必要に応じて却下
- 制約条件を追加

### 実装フェーズ

- 計画が完璧なら実装は機械的
- 「まだ実装しない」ガードが機能していることを確認
- 型チェックを継続的に実行

## 既存のULモードとの違い

| 項目 | UL Dual Mode | UL Workflow Mode |
|------|--------------|------------------|
| 目的 | 効率的な委任実行 | 計画レビュー必須の規律ある開発 |
| 成果物 | なし | research.md, plan.md |
| 承認フロー | なし | 各フェーズで明示的承認必須 |
| 主導権 | LLMの裁量 | ユーザーが意思決定の主導権を維持 |

## 関連

- [UL Dual Mode](10-ul-dual-mode.md) - 効率的な委任実行モード
- [Subagents](08-subagents.md) - サブエージェントの詳細
- [Agent Teams](09-agent-teams.md) - エージェントチームの詳細
