# TODO: Codex風 Plan Mode 実装

## P0: 状態管理を固める

- [x] `planModeEnabled` / `executionMode` の2フラグ管理をやめる
- [x] 単一の `mode` enum に統一する
  - [x] `normal`
  - [x] `planning`
  - [x] `plan_ready`
  - [x] `executing`
  - [x] `completed`
  - [x] `aborted`
- [x] 不正な状態遷移を防ぐ transition 関数を作る
- [x] mode ごとに利用可能ツールを明示的に定義する
- [x] セッション復元時の後方互換 (旧 enabled/executing → mode 復元)

## P0: Plan JSON スキーマを固定する

- [x] `<plan_steps_json>` の正式スキーマを決める
- [x] 各stepに必須フィールドを定義する
  - [x] `id`
  - [x] `title`
  - [x] `instruction`
  - [x] `acceptance`
  - [x] `status`
- [x] `id` の形式を kebab-case に統一する
- [x] プロンプト内の `snake-case-id` 表記を修正する
- [x] JSON parse失敗時のフォールバック処理を作る
- [x] 不正なstepをユーザーに提示せず、再生成させる

## P0: Plan中の安全境界を強制する

- [x] planning mode中は write/edit 系ツールを必ずブロックする
- [x] planning mode中は副作用のあるコマンドを実行できないようにする
- [x] ツール制限をプロンプト依存にしない
- [x] host側で権限を強制する (tool_call event)
- [x] ブロックされたツール呼び出しをログに残す
- [x] ブロック理由をモデルに返す
- [x] plan_ready モードでも同じ読み取り専用制限を適用

## P0.5: 承認フローを作る

- [x] plan生成後に `plan_ready` 状態へ移行する
- [x] `/execute-plan` は `plan_ready` のときだけ許可する
- [x] `/execute-plan` 前に対象planの要約を表示する
- [x] plan更新時は revision を増やす
- [ ] 古いplanを誤って実行しないように plan id を持つ (部分的: planRevision あり)
- [ ] 実行開始後は plan 内容を固定する

## P1: 実行モードを堅くする

- [x] executing modeでは保存済みplanだけを参照する
- [x] 各stepに `status` フィールドを持つ
  - [x] `pending`
  - [x] `in_progress`
  - [x] `done`
  - [x] `failed`
  - [x] `skipped`
- [x] `[DONE:id]` で status も "done" に更新する
- [ ] stepごとの順次実行を強制する
- [ ] step完了時にacceptance条件を確認する
- [ ] 失敗時に停止するか継続するかの方針を決める

## P1: Verificationを追加する

- [x] 各stepに `verification` フィールドを追加する
- [x] テストコマンドをplanに含められるようにする
- [x] verification が実行モードプロンプトに含まれる
- [x] プランモードプロンプトに verification の説明を追加
- [ ] verificationコマンドの自動実行
- [ ] verification結果の保存
- [ ] verification失敗時はstepを `failed` にする
- [ ] 最終レポートに成功/失敗理由を出す

## P1: Bashの扱いを制限する

- [x] planning modeではbashをデフォルト無効にする
- [x] bash許可時も読み取り専用コマンドだけに制限する
- [x] 正規表現ベースの安全判定を信用しすぎない (READMEに注記)
- [x] allowlist方式 (SAFE_PATTERNS + DESTRUCTIVE_PATTERNS)
- [ ] 可能ならshell文字列ではなく argv 形式にする
- [ ] 作業ディレクトリを制限する
- [x] redirect / pipe / subshell / command substitution を制限する
- [x] `rm`, `mv`, `cp`, `chmod`, `curl`, `wget`, `git push` などを明示ブロックする

## P1: 日本語アクション語判定を修正する

- [x] `ACTION_WORDS_JA_RE` を文字クラスではなく語単位の正規表現にする
- [x] 例: `追加|更新|修正|削除|作成|実装|確認|検証|テスト|...`
- [x] 英語・日本語混在のstep titleでも検出できるようにする
- [x] 誤検出を減らすテストを追加する

## P1: UI / UXを整える

- [x] `/plan` コマンドでplanning modeに入る
- [x] `/execute-plan` コマンドで実行する
- [x] `/revise-plan` コマンドでplan修正に戻る
- [x] `/discard-plan` コマンドでplanを破棄する
- [x] 現在のmodeをTUI上に表示する (フッターにmode indicator)
- [x] plan_ready状態では「実行待ち」であることを明示する
- [x] 実行中は現在のstepを表示する (ステータスアイコン付き)
- [x] 完了後にサマリーを表示する

## P2: Plan revisionを扱う

- [x] planに `planRevision` を付与する
- [x] plan修正時に revision を増やす
- [ ] planに `planId` を付与する
- [ ] 実行済みplanの再実行を防ぐ
- [ ] revision間のdiffを表示できるようにする

## P2: ログと監査性を追加する

- [ ] mode遷移ログを残す
- [ ] tool callログを残す
- [ ] ブロックされたtool callログを残す
- [ ] plan生成時の入力コンテキストを記録する
- [ ] 実行結果をstepごとに記録する
- [ ] 最終的な変更ファイル一覧を記録する

## P2: テストを増やす

- [x] 状態遷移テストを追加する (30テスト)
- [x] plan_ready以外で `/execute-plan` が失敗することを確認する
- [x] planning/plan_ready中にwrite/editがブロックされることを確認する
- [x] 不正なJSON planを拒否することを確認する
- [x] kebab-case以外のstep idを拒否することを確認する
- [x] 日本語step titleのvalidationテストを追加する
- [x] verification フィールドの抽出テストを追加する
- [x] プロンプト整合性テストを追加する

## P2: ドキュメントを整備する

- [x] `README.md` にplan modeの概要を書く
- [x] コマンド一覧を書く
- [x] mode遷移図を書く
- [x] plan JSON schemaを書く
- [x] セキュリティ上の制約を書く
- [x] 既知の制限を書く

## P3: Codex風の体験に近づける

- [ ] `Shift+Tab` 相当のplan mode切替を検討する
- [ ] Approve / Revise / Discard のUIを追加する (現在はコマンドのみ)
- [ ] plan stepごとの承認を検討する
- [ ] 実行前にdiff予測を表示する
- [ ] 実行後にactual diffを表示する
- [ ] step失敗時に自動修正planを提案する
- [ ] 長時間タスク向けに途中再開できるようにする

## Done条件

- [x] planning mode中にファイル変更が発生しない
- [x] planが構造化JSONとして保存される
- [x] ユーザー承認なしに実行へ移行しない (plan_ready ゲート)
- [x] 実行中は保存済みplanに沿って進む
- [x] stepごとの進捗が追跡できる
- [ ] verification結果が確認できる (フィールドあり、自動実行は未実装)
- [ ] 失敗時にどのstepで止まったか分かる
- [ ] Piホスト上で実機動作確認が完了している
