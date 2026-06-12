# zip-repo

`zip-repo` は、Git repository の現在の worktree 状態を ZIP 化し、macOS clipboard に file reference としてコピーする utility feature です。

## 使う場面

- 現在の作業状態をそのまま共有したい
- HEAD に未コミット変更を重ねた状態を保存したい
- issue や chat に ZIP を添付したい

## Command

- `/zip`: worktree の現在状態を ZIP 化
- `/zip --head`: HEAD の状態を ZIP 化
- `/zip --worktree`: worktree overlay を明示

## 境界

これは human convenience のための utility feature です。autonomous work や safety boundary は担いません。
