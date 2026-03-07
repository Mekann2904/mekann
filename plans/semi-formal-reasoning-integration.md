<!-- /Users/mekann/github/pi-plugin/mekann/plans/semi-formal-reasoning-integration.md -->
<!-- このファイルは、semi-formal reasoning をエージェント運用へ組み込む計画を定義します。 -->
<!-- なぜ存在するか: reasoning の型を一貫して自動適用し、推測ベースの判断を減らすためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/.pi/lib/prompt-templates.ts, /Users/mekann/github/pi-plugin/mekann/.factory/droids/planner.md, /Users/mekann/github/pi-plugin/mekann/.factory/droids/verifier.md, /Users/mekann/github/pi-plugin/mekann/docs/02-user-guide/08-subagents.md -->

# Goal
semi-formal reasoning を既存のサブエージェント実行フローへ組み込み、コード調査、レビュー、検証の場面で、明示的な前提、実行経路、反例、結論を要求する。これにより、名前や見た目だけで判断する誤りを減らす。

# Non-goals
- 新しい実行エンジンや専用 verifier の追加
- 推論結果の機械検証
- 既存の全プロンプト基盤の再設計

# Acceptance Criteria
- [ ] サブエージェントの共通 prompt template に semi-formal reasoning が追加される
- [ ] planner / executor / verifier droid が semi-formal reasoning の出力型を明示する
- [ ] 自動注入されるテンプレート構成をテストで検証できる
- [ ] 利用者向けドキュメントに自動適用の説明がある

# Constraints
- 既存の before_agent_start 注入フローを壊さない
- 変更は最小に保つ
- 既存のテンプレート設計と命名を優先する

# File/Module Impact
- `.pi/lib/prompt-templates.ts`: semi-formal reasoning テンプレート追加と default 適用
- `.factory/droids/planner.md`: 計画時の semi-formal 出力規約を追加
- `.factory/droids/executor.md`: 実装時の証拠ベース進行規約を追加
- `.factory/droids/verifier.md`: 検証時の premise / trace / verdict 規約を追加
- `docs/02-user-guide/08-subagents.md`: 自動適用される reasoning policy を追記
- `tests/unit/lib/prompt-templates.test.ts`: テンプレート追加と default 適用のテスト

# Implementation Order
1. 計画書を作成する
2. prompt template を追加する
3. droid 定義を更新する
4. 利用者向けドキュメントを更新する
5. テストを追加する
6. テスト実行と差分確認を行う

# Test & Verification
- 自動テスト: `vitest` で `prompt-templates` の単体テストを実行
- 手動確認: default template に semi-formal reasoning が含まれることをコードで確認
- 回帰確認: 既存の `buildPromptWithTemplates` と `getTemplatesForAgent` の挙動を維持する

# Risks / Rollback
- 主なリスク: プロンプトが長くなりすぎる
- 戻し方: semi-formal template を default から外し、必要ロールのみに限定する

# Progress Log
- 2026-03-07 planner: 初版作成
- 2026-03-07 executor: prompt template、droid 定義、subagents ガイド、単体テストを追加
- 2026-03-07 verifier: `npm run test -- tests/unit/lib/prompt-templates.test.ts` で 3 件通過
