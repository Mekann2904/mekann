# 0028. issue_workflow create_pr targets the branch the worktree was forked from

`/issue` で作った issue worktree の `create_pr` は、これまで `--base` を渡さないため常にリポジトリのデフォルトブランチ（通常 `main`）を向いていた。worktree 自体は起動元ブランチ（`develop` や親 `issue-<n>`）から正しく分岐しているのに PR の base だけが `main` 固定になる不整合があり、リリースブランチ運用や stacked PR で実害が出ていた。AGENTS.md の「stacked PR では base ブランチ関係を明示せよ」とも矛盾していた。

`create_pr` が `base` を省略したとき、worktree 作成時に記録した fork 元ブランチへ `--base` を自動解決する。明示 `base` は常に優先する。

## Status

Accepted

## Context

ADR-0017 の worktree management では `createWorktree` が `git worktree add -b issue-<n> <path> HEAD` で起動元の HEAD から分岐するため、`develop` や親 issue ブランチ上で `/issue` すれば worktree は正しい起点を持つ。しかし ADR-0019 の `issue_workflow` `create_pr` は `gh pr create` に `--base` を渡すのは呼び出し側が明示したときだけで、プロンプトにも base 指示が一切なかった。結果として gh はリポジトリのデフォルトブランチを使い、PR が常に `main` に向く。worktree の fork 点と PR の base がズレるため:

- `develop` や `release/x` から `/issue` しても `main` 向けの PR になる。
- 子 Work Pi を親 `issue-<n>` から起動しても `main` 向けになり、親の未マージコミットが子 PR の diff に混入してレビュー不能になる（stacked PR が壊れる）。

ADR-0023 により `issue_workflow` は Issue Work Pi のみで動く。base 解決もこのスコープ内で完結する。

## Decisions

- **fork 点を `git config` に記録**: `createWorktree` は worktree 追加前に `detectCurrentBranch(repoRoot)`（`git rev-parse --abbrev-ref HEAD`）で起動元ブランチを取得し、`git config branch.<branch>.mekann-base <base>` で共有 `.git/config` に記録する。detached HEAD や取得失敗時は空文字とし記録しない。
- **共有 config を使う理由**: linked worktree は `.git/config` を共有するため、`repoRoot` で書いた値を issue worktree から読める。working tree に入らないので誤コミットされず、worktree 削除で不要になれば `removeWorktree` が `--unset` する。
- **`create_pr` の自動解決優先順位**: 明示 `base` > 記録された fork 点 > gh デフォルト（= 従来通り main）。明示があるときは config 読み出しすら行わない。結果の `baseSource`（`explicit` / `recorded` / `default`）を details に含め、挙動を追跡可能にする。
- **`current_branch` に `prBase` を露出**: agent が PR 作成前に「どこへ向くか」を確認できるよう、`current_branch` action が記録された base を報告する。
- **レジューズで上書きしない**: 既に記録がある場合は上書きせず、repoRoot が別ブランチへ進んでも最初の fork 点を保持する。`resolveIssueWorktreePath` は既存 worktree を再利用するため再作成自体が稀だが、branch だけ残る再生成経路でも元の base を保つ。
- **自己参照を防ぐ**: `baseBranch === branch`（例: `issue-9` 上で `issue-9` を作る）のときは記録しない。

## Considered Options

- **sidecar ファイル（worktree 内 `.mekann/issue-base`）**: working tree 内に置くため誤コミットのリスクがあり却下。`.git/config` は working tree 外で安全。
- **親 issue ブランチを自動的に base にする orchestration 改造**: AGENTS.md は「blocking issue を先にマージせよ。stacked PR は明示的に必要な場合のみ」としており、依存順にマージする flat 構成を既定としている。自動積み上げはこの方針と衝突するため却下。起動元ブランチを記録する単一機構で、手動で親 worktree から `/issue` した場合の stacked PR は自然にカバーできる。
- **`gh` のデフォルト（main）のまま放置**: ユーザ要望「起動ブランチへ出す」と直接矛盾するため却下。

## Consequences

- `/issue` を `main` で起動した場合は `main` が記録され、`gh pr create --base main` となる（従来と等価・挙動変更なし）。
- `/issue` を `develop` 等で起動した場合はそのブランチへ PR が出る。fork 元ブランチが remote に無い（push 済みでない）場合は `gh pr create --base` が明確にエラーになるため、記録なしなら gh デフォルトへ落ちる挙動と使い分けが自明。
- 手動で親 `issue-<n>` の worktree から `/issue <child>` すると `issue-<child>` の PR が `issue-<n>` を向く stacked PR になる。親マージ時に GitHub が自動で `main` へ retarget するため標準的な stacked PR フローと整合する。
- `removeWorktree` が base 設定を破棄するため、設定が蓄積しない。
- `create_pr` の details に `base` / `baseSource` が増え、`current_branch` の details / 出力に `prBase` が増える。既存テストは明示 base と既定動作を両方カバーする。
