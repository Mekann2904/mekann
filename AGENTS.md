<!-- /Users/mekann/github/pi-plugin/mekann/AGENTS.md -->
<!-- このファイルは、このリポジトリでAIエージェントが守る計画運用ルールを定義します。 -->
<!-- なぜ存在するか: セッションが変わっても Spec-first と進捗更新の規律を維持するためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/README.md, /Users/mekann/github/pi-plugin/mekann/docs/02-user-guide/07-plan.md, /Users/mekann/github/pi-plugin/mekann/.factory/droids/planner.md, /Users/mekann/github/pi-plugin/mekann/plans/feature-template.md -->

# AGENTS.md

## Planning Policy

- 複雑な変更は、まず計画から始める。
- 新機能、大きいリファクタ、複数ファイル変更では、先に仕様と実装順序を固める。
- 承認前の計画フェーズでは、読み取りと分析を優先する。
- 実装は `plan -> edit -> test/build/lint -> observe -> repair -> repeat` の短い反復で進める。
- 実装中は live todo を更新し、`in_progress` は常に 1 件だけにする。
- 予定外の作業が出たら、先に live todo を更新し、その理由を長い計画文書にも残す。
- 1 日を超える作業、または 3 マイルストーン以上の作業は Mission 相当の分割を検討する。

## Quality Loops

- mekann は品質ループを 3 つに分けて扱う。
- 実行ループ: 計画し、変更し、結果を観測し、修復して繰り返す。
- 検証ループ: `test`、`lint`、型検査、必要なら browser / review で結果を確かめる。
- 継続ループ: live todo、`plans/*.md`、要約、checkpoint で次の一手を失わない。
- 品質は推測ではなく verified reality で判断する。
- うまく書けた気がする、では閉じない。確認できた、で閉じる。

## Execution Rules

- 変更前に、対象ファイルと隣接ファイルを読んでから触る。
- まず quick and dirty な最小プロトタイプを作る。
- その後に検証し、失敗を観測し、必要な修復だけを足す。
- 同じ失敗を 2 回以上くり返したら、実装を増やす前に仮説を見直す。
- 進捗のない反復は止める。読んでいるだけ、直しているだけの空回りを続けない。

## Two-Layer Planning

- 短い進捗管理には live todo を使う。
- 長い判断、受け入れ条件、検証結果には `plans/*.md` を使う。
- live todo は 5〜9 個の一階層タスクに保つ。
- 各 live todo は、30〜90 分で閉じる粒度を目安にする。
- 長い計画文書は living document として更新する。
- 長い計画文書には、受け入れ条件だけでなく verify 手順、proof artifacts、継続メモを残す。

## Verification Rules

- 実装ごとに最低 1 つの検証手段を残す。理想は `lint`、型検査、テストの組み合わせ。
- UI やワークフロー変更では、可能なら browser / screenshot / manual steps まで残す。
- review が必要な変更では、バグ、セキュリティ、回帰、テスト欠落を先に確認する。
- 検証コマンド、観測結果、未解決リスクを最後に必ず記録する。
- proof artifacts を優先する。例: テスト結果、スクリーンショット、ログ、coverage、再現手順。

## Continuity Rules

- todo は常に最新化し、次にやることを 1 つだけ前面に出す。
- 長時間作業では、重要な判断、保留、失敗パターンを `plans/*.md` に残す。
- 文脈圧縮が入っても再開できるよう、作業中ファイル、現在地、次の一手を明記する。
- 戻しやすさを保つため、小さく区切って保存し、差分の意味を追える状態を保つ。

## Role Split

- `planner` は仕様、受け入れ条件、実装順序、検証方針を作る。
- `executor` は承認済み計画に従って実装する。
- `verifier` は実装結果と受け入れ条件の整合性を検証する。
- `verifier` は proof artifacts を集め、verified / not verified を分けて報告する。
- planner と executor は同じセッションで兼務しないほうがよい。

## Codebase Rules

- 既存の命名規則とファイル配置を優先する。
- 新規依存は明確な理由がある場合だけ追加する。
- 変更ごとに最小限のテストか検証手順を残す。
- 既存ドキュメントと `plan_*` ツール群を活用し、別の計画系を重複実装しない。
