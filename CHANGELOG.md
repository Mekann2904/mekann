# Changelog

この project は `0.x` の間、厳密な semantic versioning を保証しません。user-facing な変更、設定変更、安全境界、migration note をここに記録します。

## Unreleased

- Work Pi のモデル設定を `modes`（Collaboration Modes）に一元化。review-fixer と issue の Work Pi モデル・thinking が feature 固有タブに散在していたのを、`modes` の Work Pi プロファイル（`models.review_fix` / `thinking.review_fix` / `models.issue` / `thinking.issue`）に統合した。設定エディタの「Collaboration Modes」タブで全 Work Pi モデルを一覧管理できる。
  - **migration note**: 従来 `features.review-fixer.model` / `features.review-fixer.reasoningEffort` に設定していた値は無視されるようになった。`features.modes.models.review_fix` / `features.modes.thinking.review_fix` に再設定すること。
  - 新設 `issue` プロファイルで Issue Work Pi のモデルを初めて指定可能に（未設定なら pi デフォルト）。`launchPiSessionInKittySplit` が `--model provider/id` / `--thinking` を pi に渡し、autopilot / orchestration / bulk の全起動経路が modes から解決して渡す。対象: `mekann/safety/modes/{utils,settingsSchema,index}.ts`、`mekann/autonomy/review-fixer/{settingsSchema,settingsLoader}.ts`、`mekann/utils/terminal/pi-session.ts`、`mekann/utils/issue/orchestration/{issueModel.ts(新設),autopilot/extension.ts,extension.ts,cli.ts}`。
- `/issue` と `/issue-autopilot` で新しい Issue Work Pi が起動しない致命的不具合を修正（真因）。`launchPiSessionInKittySplit` が node/pi の引数を `JSON.stringify` でクォートした 1 本の `sh -lc "..."` コマンド文字列に結合していたため、`--append-system-prompt` の内容に含まれるバッククォート（マークダウンのコードフェンス例 `` `demote_to_ready_for_human` `` `` `issue_comment` ``）が sh のダブルクォート内で**コマンド置換として発火**し、`command not found` / `unmatched '` で pi が起動前に異常終了していた。`kitten @ launch` は末尾の argv を直接実行できるため、`node` + `pi` 引数を**生 argv 配列**（各トークンが独立 argv）で渡すように変更し、シェル再パスを完全に排除。対象: `mekann/utils/terminal/pi-session.ts`（`quoteShell` 廃止、argv 直接渡し）。
- `/issue` と `/issue-autopilot` が起動済みの Issue Work Pi pane を正しく検出できない不具合も修正。pi の対話モードが初期化を完了すると kitty のウィンドウタイトルを `π - <name> - <cwd>` に上書きするため、従来の先頭一致検出（`^Issue #N`）がマッチしなくなる問題だった。検出を env マーカー（`MEKANN_ISSUE_PI` / `MEKANN_AUTOPILOT_CHILD` / `MEKANN_ORCHESTRATION_CHILD`）ベースに変更（env は起動瞬間に設定され pi に上書きされないため初期化レースに強い）。タイトルはフォールバックとして残存。対象: `mekann/utils/terminal/kitty/control.ts`。
- `scripts/prepush-parallel.sh` の同時実行ジョブ数を `PREPUSH_MAX_JOBS`（デフォルト3）で制限し、テスト実行時のCPU過負荷を解消。従来は14ジョブを無制限に並列起動し、8コア環境で load avg 14超・node プロセス57個に達してコンテキストスイッチのスラッシングを起こしていた。制限後はピーク負荷を load avg 約11・プロセス15個に削減しつつテスト通過時間も短縮。CI や別コア数環境では環境変数で調整可能。: `output-gate/redact.ts` (shim), `isSafeCommand` (alias と re-export), `Mode` 型 alias, `CacheFriendlyPromptConfig.includeBaseSystemPromptInStableHash`。これらは後方互換のために残されていたが、非 test ファイルの呼び出し元が 0 件になっていた。`redactSecrets` のテストは実体のある `tool-output/redact.ts` を直接参照するよう移行済み。
- OSS 利用者向けの入口ドキュメントを追加。
- installation、configuration、architecture、support、security、contribution 導線を整備。
- GitHub issue template を追加。
