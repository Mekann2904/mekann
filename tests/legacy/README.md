# Legacy Tests

このディレクトリには、プロジェクトルートから移動された実験的・再現用テストファイルが含まれています。

## ファイル一覧

| ファイル | 目的 | 移動元 |
|---------|------|--------|
| test-actual-usage.ts | tool-compilerの実際の使用シナリオテスト | ルート |
| test-enoent-reproduction.ts | ENOENTバグの再現テスト（race condition） | ルート |
| test-extension-load.ts | 拡張機能ロード確認 | ルート |
| test-simulation.ts | エージェントからのツール呼び出しシミュレーション | ルート |
| test-tool-validation.ts | compile_tools/execute_compiledのパラメータバリデーション | ルート |

## 注意事項

- これらのファイルはVitestのテストスイートには含まれていません（`*.test.ts`のパターンに一致しないため）
- 実験的なコードやバグ再現用のコードが含まれている可能性があります
- 必要に応じて `tests/unit/` または `tests/integration/` に移動してください

## 履歴

- 2026-03-01: sprint-1.2-test-consolidation により test/ から tests/legacy/ に統合
