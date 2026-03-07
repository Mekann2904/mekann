<!-- /Users/mekann/github/pi-plugin/mekann/plans/automatic-workspace-verification.md -->
<!-- このファイルは、自動ワークスペース検証オーケストレーションの仕様と受け入れ条件を定義します。 -->
<!-- なぜ存在するか: 実装後に未検証のまま完了扱いになる問題を防ぐためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/.pi/extensions/workspace-verification.ts, /Users/mekann/github/pi-plugin/mekann/.pi/lib/workspace-verification.ts, /Users/mekann/github/pi-plugin/mekann/tests/unit/extensions/workspace-verification.test.ts, /Users/mekann/github/pi-plugin/mekann/README.md -->

# Goal
コード変更を検知したら、`mekann` が標準の検証コマンド、必要なら開発サーバー起動、必要なら UI smoke check までを自動で回せるようにする。加えて、最後の書き込み以降に検証成功がない状態では、完了系の操作を止める。これで「実装だけして終わる」既定挙動を崩す。

# Non-goals
- 完全なブラウザ自動化基盤を一から作り直すこと
- 任意の危険コマンドを無制限に自動実行すること
- 既存の `loop_run` や Inspector/Challenger 系の検証ワークフローを置き換えること

# Acceptance Criteria
- [ ] `edit` / `write` / `patch` の成功を検知すると、ワークスペースが `dirty` になり「検証待ち」状態を保持する
- [ ] `turn_end` 時に自動検証が有効で、前回の自動検証が動作中でない場合、標準検証を自動実行する
- [ ] 標準検証は `lint` / `typecheck` / `test` / `build` / `runtime` / `ui` を設定ベースで順番に回せる
- [ ] `runtime` は `background-process` を使って ready 判定付きで開発サーバーを起動または再利用できる
- [ ] `ui` は `playwright_cli` を使った smoke check を設定ベースで実行できる
- [ ] 最後の書き込みより後に成功した検証がない場合、`task_complete` と `plan_update_step(status=completed)` をブロックする
- [ ] 次ターンの system prompt に「未検証」または「直近失敗」の状況が注入される
- [ ] 設定確認・更新・手動再実行・状態確認のためのツールが追加される
- [ ] 単体テストで dirty 管理、自動実行、完了ブロック、設定更新を検証する
- [ ] `package.json`、`AGENTS.md`、`plans/*.md`、`README.md` から verification runbook を抽出できる
- [ ] profile (`web-app` / `library` / `backend` / `cli`) を自動推定し、既定の検証段階を切り替えられる
- [ ] 各検証 run は `.pi/verification-runs/` に証跡を保存し、後続ターンから参照できる
- [ ] Web アプリでは runtime 成功後に UI smoke check が自動で続く

# Constraints
- 既存の `background-process` と `playwright-cli` を再利用する
- コマンド実行は shell injection を避けるため単一行、非シェル演算子に限定する
- 既存の自律実行ポリシーを壊さず、完了ゲートと実行ループだけ追加する
- 設定が空でも安全に動き、デフォルトは `npm run lint` / `npm run typecheck` / `npm test` を優先する

# File/Module Impact
- `.pi/lib/workspace-verification.ts`: 設定、状態、コマンド実行、dirty 判定の共通実装を追加
- `.pi/extensions/workspace-verification.ts`: 自動検証フック、完了ゲート、管理ツールを追加
- `package.json`: 新拡張を読み込む
- `README.md`: 新しい検証機能と使い方を追記
- `tests/unit/extensions/workspace-verification.test.ts`: 拡張の単体テストを追加
- `tests/unit/lib/workspace-verification.test.ts`: ライブラリの単体テストを追加

# Implementation Order
1. 共通ライブラリで設定と状態保存を作る
2. 検証コマンド実行と結果集約を作る
3. 拡張で `tool_result` / `turn_end` / `before_agent_start` / `tool_call` を接続する
4. 設定ツールと手動実行ツールを追加する
5. 単体テストを追加する
6. README を更新する

# Test & Verification
- 自動テスト: `workspace-verification` のライブラリ/拡張テスト、既存の `background-process` / `playwright-cli` への回帰なし
- 手動確認: 書き込み後に dirty 化し、自動検証が走り、成功後に clean に戻ること
- 回帰確認: `npm run typecheck`、`npm run test -- workspace-verification background-process playwright-cli`

# Risks / Rollback
- 主なリスク: `turn_end` の自動実行が再帰すること、過剰に検証が走ること、完了ゲートが強すぎること
- 戻し方: `workspace-verification` 拡張を `package.json` から外し、追加ファイルを削除する

# Progress Log
- 2026-03-07 planner: 初版作成
- 2026-03-07 executor: Phase 2 として runbook抽出、profile、自動artifact保存を追加
