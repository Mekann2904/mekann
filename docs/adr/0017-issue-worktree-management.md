# Issue worktree management via Kitty-only 2-stage split

GitHub issue 対応時に `git worktree` で独立した作業環境を作り、Kitty split で別 pi セッションを開く。管理フォルダーは `../<project>-worktrees/issue-<number>/` に配置し、ブランチ名も `issue-<number>` に統一する。

Pi の cwd はセッション作成時に固定され変更できないため、メインセッションの cwd を移動するのではなく、Kitty split で別プロセスの pi を起動する方式を採用した。一覧（OpenTUI）と pi セッションは別 split で起動する 2 段階方式とし、ラッパー+exec の単一プロセス方式より安定性を優先した。Kitty 以外のターミナルでは split が開けないため、コマンド自体を登録しない。

## Considered Options

- **メインセッションの cwd を変更**: Pi はセッション途中で cwd を変更できないため不可。
- **Subagent に worktree で作業させる**: ユーザーが直接作業・レビューしたいケースに合わない。autoresearch の候補隔離用とは目的が異なる。
- **ラッパー+exec（1プロセス方式）**: プロセス置き換えのリスクがあり、エラー時のリカバリが不安定。
- **Kitty 以外のフォールバック**: worktree 作成自体は可能だが、split で pi を開く体験が本機能の核心であり、フォールバックすると機能として成り立たない。

## Consequences

- ユーザーは Kitty でしか `/issue` を使えない。
- autoresearch worktree（`.pi/autoresearch-worktrees/`）と issue worktree（`../<project>-worktrees/`）は目的も場所も別物として扱う。
- `gh` CLI と git リポジトリが前提。不足時はコマンドを登録しない。
