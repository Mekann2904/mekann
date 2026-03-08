---
title: UL Dual Mode
category: user-guide
audience: daily-user
last_updated: 2026-03-09
tags: [ul-dual-mode, orchestration, workflow]
related: [../README.md, ./01-extensions.md, ./08-subagents.md, ./16-ul-workflow.md]
---

# UL Dual Mode

> パンくず: [Home](../../README.md) > [User Guide](./) > UL Dual Mode

## 概要

`ul-dual-mode` は `ul ...` 入力を UL ワークフロー向けの固定プロンプトへ変換する入口です。

現在の実装は、以前の adaptive / agent-team 中心モードではありません。

役割は次の2つです。

- `ul <task>` を 1ターン限定の UL ワークフロー実行に変換する
- `/ulmode` でセッション全体の UL モードを切り替える

## 使い方

### 1ターンだけ使う

```bash
ul 認証フローのバグを修正
ul workflow 通知バグを調査して直す
ul fast READMEの説明を整理する
```

`ul <task>` と `ul workflow <task>` は、そのターンだけ UL モードを有効にします。

次の通常プロンプトには引き継がれません。

### セッション全体で使う

```bash
/ulmode on
```

無効化:

```bash
/ulmode off
```

状態確認:

```bash
/ulmode status
```

引数なしの `/ulmode` は toggle です。

## `ul` サブコマンド

```bash
ul help
ul status
ul approve
ul annotate
ul abort
ul resume <taskId>
```

意味:

- `ul help`: 使い方を表示
- `ul status`: `ul_workflow_status` を呼ぶ
- `ul approve`: 確認後に `ul_workflow_approve` を呼ぶ
- `ul annotate`: 確認後に `ul_workflow_annotate` を呼ぶ
- `ul abort`: 確認後に `ul_workflow_abort` を呼ぶ
- `ul resume <taskId>`: `ul_workflow_resume` を呼ぶ

## 実際の動作

`ul <task>` は、内部では UL workflow 用の固定フロー指示に変換されます。

流れは次です。

1. `ul_workflow_start`
2. `ul_workflow_status`
3. `ul_workflow_research`
4. `ul_workflow_approve`
5. `ul_workflow_plan`
6. `question` で人間確認
7. 承認後に `ul_workflow_execute_plan`
8. `workspace_verify`
9. 必要なら verification ack
10. `ul_workflow_commit`

つまり、UL dual mode 自体が実装を持つのではなく、UL workflow へ入るための薄い制御層です。

## 承認前ガード

UL モード中、plan 承認前は通常ファイルへの `edit` / `write` を止めます。

ただし、次のワークフロー成果物は編集できます。

- `.pi/ul-workflow/tasks/<taskId>/research.md`
- `.pi/ul-workflow/tasks/<taskId>/plan.md`
- `.pi/ul-workflow/tasks/<taskId>/task.md`
- `.pi/ul-workflow/tasks/<taskId>/status.json`

実装フェーズに入った後は通常ファイルの編集を許可します。

## ステータス表示

UL モードが有効なとき、ステータスバーには単に次が表示されます。

```text
UL mode
```

以前の `subagent:✓` や `team:✓` のような詳細表示は、現行実装にはありません。

## Reviewer と verification

reviewer ガードレールは既定で無効です。

`PI_UL_SKIP_REVIEWER_FOR_TRIVIAL` と `UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL` の設定は残っていますが、現行の主な完了ゲートは reviewer ではなく `workspace_verify` です。

特に web app / site を触った場合は、runtime / ui 検証と `console error` の確認が重要です。

## 制限事項

- `--ul` CLI フラグは現行実装では無効です
- CLEAR_GOAL_SIGNAL による自動 goal loop 切り替えも無効です
- `ul fast <task>` は通知文が軽量寄りなだけで、別エンジンではありません
- policy string 注入の内部フックはありますが、現状は空です

## 関連

- [UL Workflow](./16-ul-workflow.md)
- [Subagents](./08-subagents.md)
