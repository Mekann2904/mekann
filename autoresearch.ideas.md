# Autoresearch Ideas

## Maintenance Cost Reduction (Ongoing)

- **Merge /plan-model and /plan-thinking command registrations**: ✅ Done via registerModeConfigCommand factory.
- **Inline `escapeAppleScriptPath` in zip-repo**: Identical to `escapeSbplString` in macSeatbelt.ts but different packages — cannot share without coupling packages.
- **Sandbox index.ts `localBash` lazy init pattern**: The `LocalBashWithCwd` type and lazy initialization adds ~15 lines. Could potentially be simplified.
- **SBPL template string in macSeatbelt.ts**: The `buildMacSeatbeltPolicy` function is ~130 lines of template string. Hard to reduce without compromising readability of the security policy.
- **Consolidate test mock patterns**: Multiple test files have similar mock setups for pathPolicy, macSeatbelt, etc. A shared test helper file could reduce test LOC.

## Test Improvements (Deferred)

- ~~**plan-mode/index.ts のテスト**: Extension API をモックして tool_call, context, before_agent_start, agent_end, turn_end, model_select, thinking_level_select, session_start フックをテストする~~ ✅ Done (73.7% coverage)
- ~~**sandbox/index.ts extension body のテスト**: registerTool, registerCommand, session_start/session_shutdown のモックテスト~~ ✅ Done (81.8% coverage)
- ~~**Property-based testing**: isSafeCommand の falsification テスト (fast-check を使用)~~ ✅ Done (12 invariants, 200 runs/property)
- **Mutation testing**: Stryker でテストの品質を検証
- **E2E テスト**: pi 本体と統合したエンドツーエンドのテスト
- **Performance regression テスト**: テスト実行時間の CI での監視
- ~~**Snapshot testing**: SBPL ポリシーのスナップショットテスト (意図しない変更を検出)~~ ✅ Done (11 snapshots + 8 structural invariants)
- **Test fixtures**: 共通のテストデータを fixtures/ ディレクトリに整理
- ~~**CI でのカバレッジレポート**: coverage report を CI artifact として保存~~ ✅ Done (plan-mode >=95%, sandbox >=89% thresholds)
- **Cross-platform tests**: Linux での sandbox テスト (sandbox-exec の代替)

## Code Quality (Deferred)

- **ESLint**: コードスタイルの統一
- **TypeScript strict mode**: strictNullChecks の完全適用
- **JSDoc**: パブリック API のドキュメント化
