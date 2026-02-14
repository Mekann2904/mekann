---
name: git-workflow
description: Git操作・ブランチ管理スキル。コミット作成、ブランチ操作、マージ、リベース、コンフリクト解決、履歴分析を支援。チーム開発でのバージョン管理ワークフローを効率化。
---

# Git Workflow

Git操作とブランチ管理を支援するスキル。日常的なコミット作業から、複雑なマージ・リベース、履歴分析まで対応する。

## 基本操作

### ステータス確認

```bash
# 現在の状態
git status

# 短縮形式
git status -s

# ブランチ情報付き
git status -sb
```

### 変更のステージング

```bash
# 全ての変更をステージング
git add .

# 特定ファイル
git add path/to/file

# インタラクティブ
git add -p
```

### コミット作成

```bash
# メッセージ付きコミット
git commit -m "feat: add user authentication"

# 詳細なメッセージ
git commit -m "feat: add user authentication" -m "- Add login/logout endpoints
- Implement JWT validation
- Add password hashing"

# 前回のコミットを修正
git commit --amend
```

## ブランチ操作

### ブランチ作成・切り替え

```bash
# 新規ブランチ作成
git branch feature/new-feature

# ブランチ切り替え
git checkout feature/new-feature

# 作成して切り替え（ショートカット）
git checkout -b feature/new-feature

# 現代の構文
git switch -c feature/new-feature
```

### ブランチ一覧

```bash
# ローカルブランチ
git branch

# リモートブランチ含む
git branch -a

# 最終コミット情報付き
git branch -v
```

### ブランチ削除

```bash
# マージ済みブランチ削除
git branch -d feature/old-feature

# 強制削除
git branch -D feature/old-feature

# リモートブランチ削除
git push origin --delete feature/old-feature
```

## マージとリベース

### マージ

```bash
# 通常のマージ
git merge feature/new-feature

# マージコミットを作成
git merge --no-ff feature/new-feature

# スカッシュマージ
git merge --squash feature/new-feature
```

### リベース

```bash
# 最新のmainにリベース
git rebase main

# インタラクティブリベース（直近3コミット）
git rebase -i HEAD~3

# リベース中止
git rebase --abort

# リベース続行（コンフリクト解決後）
git rebase --continue
```

## コンフリクト解決

```bash
# コンフリクト箇所を確認
git diff --name-only --diff-filter=U

# 特定ファイルを現在のブランチ版で解決
git checkout --ours path/to/file

# 特定ファイルをマージ元ブランチ版で解決
git checkout --theirs path/to/file

# 全てのコンフリクトを現在のブランチ版で解決
git checkout --ours .
```

## 履歴分析

```bash
# コミットログ（グラフ付き）
git log --oneline --graph --all

# ファイルの変更履歴
git log -p -- path/to/file

# 特定期間のコミット
git log --since="2024-01-01" --until="2024-12-31"

# 作者別統計
git shortlog -sn

# 行ごとの変更履歴
git blame path/to/file
```

## リモート操作

```bash
# リモート確認
git remote -v

# フェッチ
git fetch origin

# プル（フェッチ+マージ）
git pull origin main

# プッシュ
git push origin feature/new-feature

# 強制プッシュ（注意して使用）
git push --force-with-lease origin feature/new-feature
```

## コミットメッセージ規約

### Conventional Commits

```
feat: 新機能追加
fix: バグ修正
docs: ドキュメント更新
style: フォーマット変更（コード動作に影響なし）
refactor: リファクタリング
test: テスト追加・修正
chore: ビルド・補助ツール変更
```

### 例

```bash
git commit -m "feat(auth): add OAuth2 login support"
git commit -m "fix(api): handle null response in user endpoint"
git commit -m "docs(readme): update installation instructions"
```

## トラブルシューティング

### 直前のコミットを取り消し

```bash
# 変更を保持して取り消し
git reset --soft HEAD~1

# 変更も破棄
git reset --hard HEAD~1
```

### 特定ファイルを特定コミットに戻す

```bash
git checkout <commit-hash> -- path/to/file
```

### クリーンな状態に戻す

```bash
# 未追跡ファイル削除（ドライラン）
git clean -n

# 未追跡ファイル削除
git clean -fd
```
