# Changelog

この project は `0.x` の間、厳密な semantic versioning を保証しません。user-facing な変更、設定変更、安全境界、migration note をここに記録します。

## Unreleased

- `scripts/prepush-parallel.sh` の同時実行ジョブ数を `PREPUSH_MAX_JOBS`（デフォルト3）で制限し、テスト実行時のCPU過負荷を解消。従来は14ジョブを無制限に並列起動し、8コア環境で load avg 14超・node プロセス57個に達してコンテキストスイッチのスラッシングを起こしていた。制限後はピーク負荷を load avg 約11・プロセス15個に削減しつつテスト通過時間も短縮。CI や別コア数環境では環境変数で調整可能。: `output-gate/redact.ts` (shim), `isSafeCommand` (alias と re-export), `Mode` 型 alias, `CacheFriendlyPromptConfig.includeBaseSystemPromptInStableHash`。これらは後方互換のために残されていたが、非 test ファイルの呼び出し元が 0 件になっていた。`redactSecrets` のテストは実体のある `tool-output/redact.ts` を直接参照するよう移行済み。
- OSS 利用者向けの入口ドキュメントを追加。
- installation、configuration、architecture、support、security、contribution 導線を整備。
- GitHub issue template を追加。
