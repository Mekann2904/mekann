# Autoresearch Ideas

## Test Improvements (Deferred)

- **plan-mode/index.ts のテスト**: Extension API をモックして tool_call, context, before_agent_start, agent_end, turn_end, model_select, thinking_level_select, session_start フックをテストする
- **sandbox/index.ts extension body のテスト**: registerTool, registerCommand, session_start/session_shutdown のモックテスト
- **Property-based testing**: isSafeCommand の falsification テスト (fast-check を使用)
- **Mutation testing**: Stryker でテストの品質を検証
- **E2E テスト**: pi 本体と統合したエンドツーエンドのテスト
- **Performance regression テスト**: テスト実行時間の CI での監視
- **Snapshot testing**: SBPL ポリシーのスナップショットテスト (意図しない変更を検出)
- **Test fixtures**: 共通のテストデータを fixtures/ ディレクトリに整理
- **CI でのカバレッジレポート**: coverage report を CI artifact として保存
- **Cross-platform tests**: Linux での sandbox テスト (sandbox-exec の代替)

## Code Quality (Deferred)

- **ESLint**: コードスタイルの統一
- **TypeScript strict mode**: strictNullChecks の完全適用
- **JSDoc**: パブリック API のドキュメント化
