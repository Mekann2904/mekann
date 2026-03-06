<!-- /Users/mekann/github/pi-plugin/mekann/AGENTS.md -->
<!-- このファイルは、このリポジトリでAIエージェントが守る計画運用ルールを定義します。 -->
<!-- なぜ存在するか: セッションが変わっても Spec-first と進捗更新の規律を維持するためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/README.md, /Users/mekann/github/pi-plugin/mekann/docs/02-user-guide/07-plan.md, /Users/mekann/github/pi-plugin/mekann/.factory/droids/planner.md, /Users/mekann/github/pi-plugin/mekann/plans/feature-template.md -->

# AGENTS.md

## Planning Policy

- 複雑な変更は、まず計画から始める。
- 新機能、大きいリファクタ、複数ファイル変更では、先に仕様と実装順序を固める。
- 承認前の計画フェーズでは、読み取りと分析を優先する。
- 実装中は live todo を更新し、`in_progress` は常に 1 件だけにする。
- 予定外の作業が出たら、先に live todo を更新し、その理由を長い計画文書にも残す。
- 1 日を超える作業、または 3 マイルストーン以上の作業は Mission 相当の分割を検討する。

## Two-Layer Planning

- 短い進捗管理には live todo を使う。
- 長い判断、受け入れ条件、検証結果には `plans/*.md` を使う。
- live todo は 5〜9 個の一階層タスクに保つ。
- 各 live todo は、30〜90 分で閉じる粒度を目安にする。
- 長い計画文書は living document として更新する。

## Role Split

- `planner` は仕様、受け入れ条件、実装順序、検証方針を作る。
- `executor` は承認済み計画に従って実装する。
- `verifier` は実装結果と受け入れ条件の整合性を検証する。
- planner と executor は同じセッションで兼務しないほうがよい。

## Codebase Rules

- 既存の命名規則とファイル配置を優先する。
- 新規依存は明確な理由がある場合だけ追加する。
- 変更ごとに最小限のテストか検証手順を残す。
- 既存ドキュメントと `plan_*` ツール群を活用し、別の計画系を重複実装しない。
