# Issue workflow tool: structured git/gh actions with auto-approve in issue worktrees

GitHub issue 対応の Phase 3（commit → push → PR 作成）を agent が bash で自走する際、2つの障害があった。(1) `mekann/safety/git-safety` が bash 経由の `git push` / `gh pr create` を毎回 `ctx.ui.confirm()` で止める。(2) heredoc + `git commit -m` / `gh pr create --body` で `$`・バッククォート・改行・コードブロック入りメッセージが shell 展開で壊れる。

これを単一カスタムツール `issue_workflow` で解決する。11 の action を1つの平たい schema に集約し、message / body は JSON 引数として受け取り tmpfile に書き出して `git commit -F` / `gh pr create --body-file` 等で渡すため shell quoting を使わない。mutating action は issue worktree（branch `issue-<n>`）内のみ auto-approve し、git-safety の confirm を経由しない。

## Status

Accepted

## Context

ADR 0017 の issue worktree management と ADR 0018 の review-fixer で、issue 対応の Phase 1（実装）と Phase 2（品質ゲート）は確立した。しかし Phase 3 は bash 経由の git/gh に依存しており、git-safety の承認ゲートで停止し、heredoc の shell 展開でメッセージが壊れるため、agent が止まらずに PR まで自走できなかった。

git-safety は README の設計原則（previous message から permission を infer しない）に従い bash の mutating git/gh を毎回 confirm する。これは安全性上正しいが、issue worktree のように worktree 隔離済み・branch 自動選択済みの安全余裕がある場面では過剰であり、agent の自走を阻害する。また bash heredoc の破損は git-safety の緩和だけでは解決しない。

## Decisions

- **単一ツール・11 action 集約**: `pi.registerTool()` で `issue_workflow` を登録し、`current_branch / status / diff / view_pr / commit / push / create_pr / update_pr / ready / comment / issue_comment` を1つの schema に平たい Optional 集合として持つ。システムプロンプト増分を `promptSnippet` 1行 + `promptGuidelines` + schema 1つに抑え、`registerPromptProvider` は使わない。
- **tmpfile 経由のメッセージ渡し**: message / body / title は JSON 引数として受け取り、内部で tmpfile に書き出して `git commit -F` / `gh pr create --body-file` / `gh pr edit --body-file` / `gh pr comment --body-file` / `gh issue comment --body-file` で渡す。shell quoting を一切使わないため `$`・バッククォート・改行・コードブロックが入っても破損しない。title は argv 要素としてそのまま渡す（shell 非経由のため安全）。
- **internal execFile で git-safety 対象外**: git-safety は `tool_call` event で toolName `bash` を傍受する仕組みなので、`issue_workflow` は内部実行（`node:child_process` の `execFile`）で git/gh を呼ぶ。execFile は bash tool_call ではないため git-safety の対象にならず、issue worktree 内では mutating action が confirm なしで auto-approve される。
- **mutating action は issue worktree 内のみ**: mutating action は現在 branch が `issue-<n>` の場合のみ実行を許可する。worktree 外では明確なエラーを返し、main 等への誤操作を防ぐ。read-only action（`current_branch / status / diff / view_pr`）は場所を問わず動作する。
- **`force_with_lease` を含める**: rebase 修復後に agent が自走して push するため `push` action に `--force-with-lease` を許容する。`--force-with-lease` は遠隔の予期せぬ更新を弾く安全側の force push である。
- **`create_pr` は最初から ready**: review_fixer が品質ゲートを通過済みであるため draft にする理由が薄く、ready で作成する。`draft` 引数は残すが prompt は ready を指示する。
- **`view_pr` で `/pr-check` 互換機能を統合**: 既存の `/pr-check` コマンド相当の mergeability 確認（mergeStateStatus / mergeable）を `view_pr` action として同ツールに持たせる。既存の `/pr-check` コマンドと `agent_end` hook は別用途（PR URL 検出時の自動通知）として残置する。
- **`prepareArguments` で action ごとの必須引数バリデーション**: action ごとの必須引数（例: `commit` に `message` 必須、`create_pr` に `title`+`body` 必須）を `prepareArguments` で検証し、不正組合せは明確なエラーとして tool error にする。
- **Phase 3 プロンプトの差し替え**: `mekann/utils/issue/cli.ts` の issue session system prompt と `mekann/autonomy/review-fixer/promptProvider.ts` の fragment で、「bash で git add commit push pr」指示を `issue_workflow` の action 指示に差し替える。

## Considered Options

- **git-safety に worktree 例外を追加**: bash heredoc のメッセージ破損問題が残るため却下。2つの問題のうちメッセージ破損を解決できない。
- **既存 `/pr-check` や issue 拡張に action を追加**: 役割が肥大化し単一責任が崩れる。issue_workflow という独立ツールに集約する方が保守しやすい。
- **別途 `registerPromptProvider` を新設**: snippet + guidelines で十分であり、プロンプト増分を最小化したい。review-fixer の promptProvider は既存 fragment の文言差し替えにとどめる。
- **mutating action を worktree 外でも許可**: 安全余裕（worktree 隔離・branch 自動選択）を失うため却下。worktree 内のみに制限する。

## Consequences

- Phase 3 のプロンプトは bash でなく `issue_workflow` の action を指示する。agent は bash で git/gh を直接叩かず、`issue_workflow` 経由で Phase 3 を完遂する。
- `issue_workflow` は issue worktree 外では mutating action を拒否する（read-only のみ動作）。汎用 git/gh ツールではない。
- 既存の `/pr-check` コマンドと `agent_end` 通知 hook は残置され、`view_pr` action は同等の mergeability 確認機能を提供する。二重管理になるが、コマンド（人間向け）と tool（agent 向け）で役割が異なるため許容する。
- git-safety は変更せず、bash 経由の mutating git/gh を引き続き confirm する。`issue_workflow` は bash 経由でないためこのゲートにかからない。
- `prepareArguments` で throw したバリデーションエラーは、pi の tool runner が tool error result に変換するため、安全に agent へ伝わる。
