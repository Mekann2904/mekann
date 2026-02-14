---
name: git-workflow
description: Git操作・ブランチ管理スキル。コミット作成、ブランチ操作、マージ、リベース、コンフリクト解決、履歴分析を支援。チーム開発でのバージョン管理ワークフローを効率化。
license: MIT
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
  based-on: oh-my-zsh git plugin
---

# Git Workflow

Git操作とブランチ管理を支援するスキル。日常的なコミット作業から、複雑なマージ・リベース、履歴分析まで対応する。

**主な機能:**
- ブランチ作成・切り替え・削除
- コミット作成とメッセージ規約
- マージ・リベース・コンフリクト解決
- 履歴分析とログ確認
- リモート操作（fetch, pull, push）
- Stashによる一時保存

## 必須ルール: ユーザ確認（CRITICAL）

**git操作を実行する前に、必ず`question`ツールを使用してユーザの許可を取得すること。**

### 確認が必要な操作

以下の操作を実行する前に必ず確認:
- `git add` - ステージング
- `git commit` - コミット作成
- `git push` - リモートへのプッシュ
- `git reset` - コミットの取り消し
- `git rebase` - リベース
- `git merge` - マージ
- `git branch -d/-D` - ブランチ削除
- `git clean` - 未追跡ファイル削除
- `git checkout` - ファイル/ブランチ切り替え（破壊的変更の場合）

### 読み取り専用操作（確認不要）

以下は確認なしで実行可能:
- `git status` - ステータス確認
- `git log` - ログ確認
- `git diff` - 差分確認
- `git branch` - ブランチ一覧（削除以外）
- `git show` - コミット内容確認
- `git remote -v` - リモート確認

### questionツールの使用方法

```typescript
// 確認ダイアログの例
question({
  questions: [{
    question: "以下の変更をコミットしますか？",
    header: "Git Commit",
    options: [
      { label: "Yes", description: "コミットを実行" },
      { label: "No", description: "キャンセル" }
    ]
  }]
})
```

```typescript
// ブランチ削除の確認例
question({
  questions: [{
    question: "feature/old-branchを削除しますか？",
    header: "Branch Delete",
    options: [
      { label: "Delete", description: "ブランチを削除" },
      { label: "Cancel", description: "キャンセル" }
    ]
  }]
})
```

### ワークフロー

1. **変更内容を確認**: `git status`, `git diff` で確認
2. **ユーザに質問**: `question`ツールで実行可否を確認
3. **許可された場合のみ実行**: git操作を実行
4. **結果を報告**: 実行結果をユーザに通知

**重要**: このルールは必須（MANDATORY）です。例外なく遵守すること。

## 使用タイミング

以下の場合に使用:
- コミットを作成・修正する場合
- ブランチを作成・切り替え・削除する場合
- マージやリベースを行う場合
- コンフリクトを解決する場合
- コミット履歴を確認・分析する場合

**特に以下の場合に推奨:**
- Conventional Commitsに準拠したコミット作成
- インタラクティブリベースでの履歴整理
- 複数ブランチ間のマージ作業

## ワークフロー

### ステップ1: ステータス確認

```bash
# 現在の状態
git status

# 短縮形式
git status -s

# ブランチ情報付き
git status -sb
```

### ステップ2: 変更のステージング

```bash
# 全ての変更をステージング
git add .

# 特定ファイル
git add path/to/file

# インタラクティブ
git add -p
```

### ステップ3: コミット作成

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

### ステップ4: プッシュ

```bash
# 通常のプッシュ
git push origin feature/new-feature

# 強制プッシュ（注意して使用）
git push --force-with-lease origin feature/new-feature
```

## リファレンス

- [references/aliases.md](references/aliases.md) - oh-my-zsh準拠のエイリアス一覧

## 使用例

### 例1: 機能ブランチでの作業

```bash
# 新規ブランチ作成
git checkout -b feature/new-feature

# 変更をステージング＆コミット
git add .
git commit -m "feat: add new feature"

# リモートにプッシュ
git push -u origin feature/new-feature
```

### 例2: インタラクティブリベース

```bash
# 直近3コミットを整理
git rebase -i HEAD~3

# コンフリクト解決後
git rebase --continue

# 強制プッシュ
git push --force-with-lease origin feature/new-feature
```

### 例3: コンフリクト解決

```bash
# コンフリクト箇所を確認
git diff --name-only --diff-filter=U

# 特定ファイルを現在のブランチ版で解決
git checkout --ours path/to/file

# 解決後にコミット
git add .
git commit
```

## トラブルシューティング

### よくある問題

| 問題 | 解決策 |
|------|--------|
| 直前のコミットを取り消したい | `git reset --soft HEAD~1`（変更保持）または `git reset --hard HEAD~1`（変更破棄） |
| 特定ファイルを過去に戻したい | `git checkout <commit-hash> -- path/to/file` |
| 未追跡ファイルを削除したい | `git clean -fd`（まず `-n` でドライラン） |
| リベースを中止したい | `git rebase --abort` |
| マージを中止したい | `git merge --abort` |

## ベストプラクティス

1. **コミットメッセージ規約**: Conventional Commitsに準拠する
2. **頻繁にコミット**: 小さな論理単位でコミットする
3. **プッシュ前に確認**: `git status` と `git diff --staged` で変更を確認
4. **強制プッシュは慎重**: `--force` ではなく `--force-with-lease` を使用
5. **ブランチ名を明確**: `feature/`, `fix/`, `docs/` などのプレフィックスを使用

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

---

*このスキルはoh-my-zsh git pluginをベースに作成されました。*
