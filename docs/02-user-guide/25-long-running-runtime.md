---
title: Long-Running Runtime
category: user-guide
audience: developer
last_updated: 2026-03-08
tags: [autonomy, resume, supervisor]
related: [./07-plan.md, ./08-subagents.md, ../../README.md]
---

# Long-Running Runtime

長時間自走の統合回復レイヤーです。

現在の実装では `long-running-supervisor` が正系です。

`autonomy_*` ツールは互換レイヤーとして残っていますが、内部では同じ durable backend を使います。

`loop_run`、`subagent_run_dag`、`workspace_verify`、`background_process_*` をまたいで、root task の継続情報を `.pi/long-running/` に残します。

## 何が増えたか

- session journal
- stale session / orphan subagent / orphan background process recovery
- crash-resume 用の resume snapshot
- unattended 実行前の preflight
- root journal と session checkpoint

## 保存場所

```text
.pi/long-running/index.json
.pi/long-running/active-subagent-runs.json
.pi/long-running/sessions/<session-id>/session.json
.pi/long-running/sessions/<session-id>/checkpoint.json
.pi/long-running/sessions/<session-id>/journal.jsonl
```

`index.json` は最新 session の参照です。

`active-subagent-runs.json` は未完了 subagent の durable registry です。

各 session 配下の `journal.jsonl` は root execution の時系列ログです。

## ツール

### `autonomy_preflight`

無人実行を始める前に、今の policy と verification gate で完走できるかを確認します。

見る項目:

- 必要 permission
- `ask` / `deny` の blocker
- workspace verification の resume phase
- active subagent run や review gate の blocker

### `autonomy_resume`

直近の durable replay を表示します。

見る項目:

- latest session
- checkpoint
- workspace verification replay
- running background processes
- recent journal

### `autonomy_journal`

最新の root execution journal を表示します。

### `autonomy_supervisor`

stale session、orphan background process、stale / orphan subagent run を回収します。

`action="status"` は現状確認です。

`action="recover"` は recovery を実行します。

## 典型フロー

1. `autonomy_preflight` で blocker を確認する
2. root task を実行する
3. 中断後は `autonomy_resume` で再開地点を確認する
4. stale 状態が残ったら `autonomy_supervisor` を使う

## 注意

`autonomy_preflight` は task text と requested tool から必要 permission を推定します。

これは conservative な推定です。

実際の tool input で gatekeeper が追加 block する場合はあります。
