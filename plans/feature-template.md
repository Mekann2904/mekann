<!-- /Users/mekann/github/pi-plugin/mekann/plans/feature-template.md -->
<!-- このファイルは、長い実行計画書を残すための標準テンプレートです。 -->
<!-- なぜ存在するか: live todo では保持しきれない判断理由と検証結果を残すためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/AGENTS.md, /Users/mekann/github/pi-plugin/mekann/.factory/droids/planner.md, /Users/mekann/github/pi-plugin/mekann/.factory/droids/executor.md, /Users/mekann/github/pi-plugin/mekann/.factory/droids/verifier.md -->

# Goal
何を実現するか。利用者価値まで 1 段落で書く。

# Non-goals
今回はやらないことを書く。

# Acceptance Criteria
- [ ] 条件 1
- [ ] 条件 2
- [ ] 条件 3

# Quality Loop Strategy
- 実行ループ: どういう最小反復で進めるか。
- 検証ループ: `test` / `lint` / 型検査 / browser / review のどれを回すか。
- 継続ループ: live todo、progress log、checkpoint をどう保つか。
- Stop rule: どの状態なら反復を止めて再計画するか。

# Constraints
- 技術制約
- 既存規約
- 性能、法務、セキュリティ制約

# File/Module Impact
- `path/to/fileA`: 何を変えるか
- `path/to/fileB`: 何を変えるか

# Implementation Order
1. 探索
2. データモデル変更
3. API 変更
4. UI 変更
5. テスト
6. ドキュメント

# Test & Verification
- 自動テスト:
- 手動確認:
- 回帰確認:
- Proof artifacts:
- Verified reality の判定条件:
- 未検証の残り:

# Observe & Repair Notes
- 失敗または観測結果:
- 原因仮説:
- 次の修復:

# Continuity Notes
- 現在の in_progress:
- 次にやること:
- 作業中ファイル:
- 保留判断:

# Risks / Rollback
- 主なリスク:
- 戻し方:

# Progress Log
- 2026-03-07 planner: 初版作成
- 2026-03-07 executor: 実装ステップ更新
- 2026-03-07 verifier: 検証結果追記
