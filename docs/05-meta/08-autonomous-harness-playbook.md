<!-- /Users/mekann/github/pi-plugin/mekann/docs/05-meta/08-autonomous-harness-playbook.md -->
<!-- このファイルは、mekann の長時間自走を強いフィードバックループで回す実践 runbook を定義します。 -->
<!-- なぜ存在するか: Ralph 系の小反復運用を既存の plan / verification / supervisor に接続するためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/AGENTS.md, /Users/mekann/github/pi-plugin/mekann/.pi/APPEND_SYSTEM.md, /Users/mekann/github/pi-plugin/mekann/docs/02-user-guide/25-long-running-runtime.md, /Users/mekann/github/pi-plugin/mekann/docs/05-meta/06-autonomy-improvement-plan.md -->
---
title: 自走ハーネス運用ガイド
category: meta
audience: developer, contributor
last_updated: 2026-03-08
tags: [autonomy, long-running, harness, feedback-loop]
related: [./06-autonomy-improvement-plan.md, ./07-agent-architecture-hardening-plan.md, ../02-user-guide/25-long-running-runtime.md, ../../README.md]
---

# 自走ハーネス運用ガイド

この runbook は、mekann を「大きく 1 回で当てにいく運用」から、「小さく回して確実に前進する運用」へ寄せるための標準手順です。

狙いは明確です。

良い自律性を、強いフィードバックループの上に固定します。

## 基本原則

- 1 反復 1 焦点。最重要の 1 項目だけを進める。
- Search before change。未実装と決めつけない。
- Prototype first。最小変更で事実を取りにいく。
- Verify locally first。重い検証は最後に寄せる。
- Leave it restartable。毎回、再開可能な状態で閉じる。
- Replan on stagnation。同じ失敗を繰り返したら広げず狭める。

## 標準ループ

1. `long_running_preflight` を実行する。
2. `long_running_resume` を見て、直近の session / checkpoint / blocker を確認する。
3. `plan_*` で live todo を整える。
4. 並列探索で関連コード、既存実装、TODO、失敗ログ、spec を読む。
5. 1 つの責務だけを quick and dirty に実装する。
6. 変更単位に最も近い `test` / `lint` / `typecheck` / runtime check を回す。
7. 結果を plan / journal / artifact に残して次の 1 手を決める。

## 反復の入力

各反復は、最低でも次の 4 点を持って始めます。

- 現在地
- 今回の 1 目標
- 触るファイル候補
- 閉じるための verify 条件

これが曖昧なら、まだ実装に入る段階ではありません。

## 反復の出力

各反復は、最低でも次の 4 点を残して終えます。

- 何を変えたか
- 何を検証したか
- 何が blocker か
- 次の最小ステップは何か

成功でも失敗でも残します。

何も残さずに閉じないことが重要です。

## 並列化のルール

並列化してよいもの:

- コード探索
- 仕様との差分比較
- TODO / placeholder / dead branch の洗い出し
- ログ要約

絞るべきもの:

- build
- test
- lint
- typecheck
- browser / runtime smoke

理由は単純です。

重い検証をばらまくと、ノイズと競合で loop が鈍ります。

## 停滞時の扱い

次のどれかに当たったら、実装を増やす前に再計画します。

- 同じ失敗が 2 回続いた
- 2 反復続けて verify が前進しない
- 影響範囲が当初想定より広い
- 既存実装との競合が見つかった
- 「修正」より「前提の見直し」が必要だと分かった

このときは scope を狭めます。

大きい問題を小さい未解決問題へ分解します。

## 推奨ツールスタック

| 目的 | ツール |
|------|------|
| 無人実行前の blocker 確認 | `long_running_preflight`, `autonomy_preflight` |
| 再開地点の確認 | `long_running_resume`, `autonomy_resume` |
| live todo 管理 | `plan_create`, `plan_add_step`, `plan_update_step`, `plan_run_next` |
| 並列探索 | `subagent_run_parallel`, `subagent_run_dag`, `code_search`, `sym_find` |
| 検証ゲート | `workspace_verify` |
| 停滞時の回収 | `long_running_supervisor` |

## 推奨プロンプト方針

プロンプトは長さより制御を優先します。

推奨する骨格は次の通りです。

1. 読むべき source of truth を固定する。
2. 今回やることを 1 項目に絞る。
3. 「search before change」を明示する。
4. ローカル検証を明示する。
5. plan / journal 更新を閉じ条件に入れる。

「大きく全部やれ」より、「今いちばん重要な 1 件を、検証付きで閉じろ」の方が安定します。

## 受け入れ条件

この運用が回っている状態は、次で判断します。

- `in_progress` は常に 1 件だけ
- 各反復に proof artifact が残る
- crash 後に resume 情報だけで再開できる
- 失敗時に blocker と次の一手が残る
- 完了宣言が verified reality に基づく

## 既存計画との関係

この runbook は、既存の設計計画を置き換えるものではありません。

役割は別です。

- `06-autonomy-improvement-plan.md`: 何を実装するか
- `07-agent-architecture-hardening-plan.md`: どの設計で固めるか
- この runbook: 毎回どう回すか

## まずやること

mekann の自走を底上げしたいなら、最初の 3 手は固定です。

1. `long_running_preflight` を habit にする。
2. すべての長めの仕事を `plan_*` で 5〜9 step に切る。
3. `workspace_verify` を完了ゲートとして扱う。
