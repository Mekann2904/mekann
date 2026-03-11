<!-- /Users/mekann/github/pi-plugin/mekann/WORKFLOW.md -->
<!-- このファイルは、mekann における agent-first 実行の入口となる運用仕様を定義します。 -->
<!-- なぜ存在するか: 自律実行の起点を 1 ファイルに集約し、毎回同じ品質ループで開始できるようにするためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/AGENTS.md, /Users/mekann/github/pi-plugin/mekann/.pi/INDEX.md, /Users/mekann/github/pi-plugin/mekann/docs/05-meta/08-autonomous-harness-playbook.md, /Users/mekann/github/pi-plugin/mekann/docs/02-user-guide/07-plan.md -->
---
kind: mekann-agent-first-workflow
version: 1
tracker:
  kind: task_queue
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Cancelled
    - Failed
polling:
  interval_ms: 30000
workspace:
  root: .pi/symphony-workspaces
runtime:
  kind: pi-mono-extension
  command: pi
entrypoints:
  - AGENTS.md
  - .pi/INDEX.md
  - docs/05-meta/08-autonomous-harness-playbook.md
  - docs/02-user-guide/07-plan.md
verification:
  required_commands:
    - npm run policy:workspace
    - npm run verify:workspace -- --fail-on-interactive
    - npm run ci
completion_gate:
  require_single_in_progress_step: true
  require_proof_artifacts: true
  require_workspace_verification: true
---

# WORKFLOW

この文書は pi-mono 上で `mekann` 拡張機能を運用するための repo-native workflow です。

drop-in の外部仕様ではなく、mekann が pi 実行環境の中で自分のハーネスを回すための運用契約として使います。

## Start

1. `AGENTS.md` と `.pi/INDEX.md` を読む。
2. 関連コードと関連 docs を先に探索する。
3. 必要なら技術スタック、採用ライブラリ、公式ドキュメント、参考文献まで外部調査する。
4. 調査は inventory ではなく requirements research として扱う。
5. live todo を 5〜9 step に切る。
6. `in_progress` は 1 件だけにする。
7. 必要なら `workflow_workpad_start` で durable workpad を作る。

## Loop

1. search before change
2. research before plan
3. 外部調査が必要なタスクでは、公式ドキュメントと一次情報を先に当たる
4. research.md には references と plan への影響を書く
5. research は single dynamic DAG として扱い、gap-check 後に必要な deep-dive だけ追加する
6. planner owns direction, workers own completion
7. workers do not coordinate with each other directly
8. quick and dirty prototype first
9. local verification before closeout
10. proof artifact と next step を残す

各反復は fresh context を前提にし、継続状態は workpad / workflow artifacts / git に残す。
5. 進捗と verify 結果を workpad に追記する

## Verify

- 変更に最も近い test / lint / typecheck を優先する
- workspace 全体の完了ゲートは `workspace_verify` または `npm run verify:workspace`
- 同じ失敗が 2 回続いたら scope を狭めて再計画する

## Done

- plan が更新されている
- verify 結果が残っている
- proof artifact か未検証理由が明記されている
- 次の一手が restartable に残っている
