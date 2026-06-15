# Changelog

この project は `0.x` の間、厳密な semantic versioning を保証しません。user-facing な変更、設定変更、安全境界、migration note をここに記録します。

## Unreleased

- 呼び出し元のない非推奨 API を削除: `output-gate/redact.ts` (shim), `isSafeCommand` (alias と re-export), `Mode` 型 alias, `CacheFriendlyPromptConfig.includeBaseSystemPromptInStableHash`。これらは後方互換のために残されていたが、非 test ファイルの呼び出し元が 0 件になっていた。`redactSecrets` のテストは実体のある `tool-output/redact.ts` を直接参照するよう移行済み。
- OSS 利用者向けの入口ドキュメントを追加。
- installation、configuration、architecture、support、security、contribution 導線を整備。
- GitHub issue template を追加。
