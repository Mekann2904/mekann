---
name: git-workflow
description: Git操作・ブランチ管理スキル。コミット作成、ブランチ操作、マージ、リベース、コンフリクト解決、履歴分析を支援。チーム開発でのバージョン管理ワークフローを効率化。
license: MIT
tags: [git, version-control, branching]
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
  based-on: oh-my-zsh git plugin
---

# Git Workflow

Git操作とブランチ管理を支援するスキル。日常的なコミット作業から、複雑なマージ・リベース、履歴分析まで対応する。

**主な機能:**
- **選択的ステージング**: 自分が編集したファイルのみをadd（安易な`git add .`は禁止）
- ブランチ作成・切り替え・削除
- コミット作成とメッセージ規約
- マージ・リベース・コンフリクト解決
- 履歴分析とログ確認
- リモート操作（fetch, pull, push）
- Stashによる一時保存

## 必須ルール: 日本語出力（CRITICAL）

**このスキルを使用する際は、すべての出力を必ず日本語で行うこと。**

### 適用範囲

以下のすべてを日本語で出力すること:
- コミットメッセージ（タイトル・Body・Footer）
- ユーザへの説明・報告
- エラーメッセージの解説
- コンフリクト解決の案内
- ワークフローのステップ説明
- `question`ツールでの質問文

### 例外

以下のみ英語でOK:
- コマンド名（`git commit`等）
- コードブロック内の変数名・関数名
- 英語のIssue/PRタイトルを引用する場合

**絶対禁止**: 日本語の文脈で突然英語に切り替えること

---

## 必須ルール: ユーザ確認（CRITICAL・絶対省略禁止）

**git操作を実行する前に、必ず`question`ツールを使用してユーザの許可を取得すること。**

### 絶対ルール

```
読み取り専用操作以外のgitコマンドを実行する場合、
必ず事前にquestionツールでユーザー確認を行う。
例外なし。省略なし。簡略化なし。
```

**違反時の対応**: もし確認なしにgit操作を実行してしまった場合、即座に停止し、
ユーザーに謝罪してから確認をやり直すこと。

### 確認が必要な操作（省略厳禁）

以下の操作を実行する前に**必ず**確認:
- `git add` - ステージング（ファイル指定内容を含めて確認）
- `git commit` - コミット作成
- `git push` - リモートへのプッシュ
- `git reset` - コミットの取り消し
- `git rebase` - リベース
- `git merge` - マージ
- `git branch -d/-D` - ブランチ削除
- `git clean` - 未追跡ファイル削除
- `git checkout` - ファイル/ブランチ切り替え（破壊的変更の場合）
- `git stash` - 一時保存（pop/drop含む）
- `git cherry-pick` - チェリーピック

### 読み取り専用操作（確認不要）

以下**のみ**確認なしで実行可能:
- `git status` - ステータス確認
- `git log` - ログ確認
- `git diff` - 差分確認
- `git branch` - ブランチ一覧（削除以外）
- `git show` - コミット内容確認
- `git remote -v` - リモート確認

### questionツールの使用方法（必須）

```typescript
// ステージングの確認例（ファイル一覧を含めること）
question({
  questions: [{
    question: "以下のファイルをステージングしますか？\n- src/auth.ts\n- tests/auth.test.ts",
    header: "Git Add",
    options: [
      { label: "Yes", description: "ステージングを実行" },
      { label: "No", description: "キャンセル" }
    ]
  }]
})
```

```typescript
// コミットの確認例（コミットメッセージを含めること）
question({
  questions: [{
    question: "以下の内容でコミットしますか？\n\nメッセージ:\nfeat: ユーザー認証を追加する\n\nステージング済みファイル:\n- src/auth.ts\n- tests/auth.test.ts",
    header: "Git Commit",
    options: [
      { label: "Yes", description: "コミットを実行" },
      { label: "No", description: "キャンセル" }
    ]
  }]
})
```

```typescript
// プッシュの確認例
question({
  questions: [{
    question: "origin/feature/new-feature にプッシュしますか？\n\nコミット: abc1234 feat: ユーザー認証を追加する",
    header: "Git Push",
    options: [
      { label: "Yes", description: "プッシュを実行" },
      { label: "No", description: "キャンセル" }
    ]
  }]
})
```

### ワークフロー（厳守）

1. **変更内容を確認**: `git status`, `git diff` で確認
2. **ユーザに質問**: `question`ツールで実行可否を確認（省略厳禁）
3. **許可された場合のみ実行**: git操作を実行
4. **結果を報告**: 実行結果をユーザに通知

### よくある違反パターン（禁止）

- 「小さな変更だから」と確認を省略する
- 「ユーザーが期待しているはず」と勝手に判断する
- 「前回と同じだから」と確認を省略する
- 「面倒だから」と確認を省略する
- テキストで「よろしいですか？」と聞く（questionツールを使わない）

**重要**: このルールは必須（MANDATORY）です。例外なく遵守すること。面倒でも必ず実行すること。

## 必須ルール: 選択的ステージング（CRITICAL）

**`git add .`や`git add -A`を安易に使用せず、自分が編集したファイルのみをステージングすること。**

### 禁止パターン

以下のコマンドは**原則として使用禁止**（例外あり）:

```bash
# 禁止: カレントディレクトリ以下の全ファイルをステージング
git add .

# 禁止: ワーキングツリー全体をステージング
git add -A
git add --all

# 禁止: 全ファイルをステージング（削除含む）
git add -u
```

### 推奨パターン

```bash
# 推奨: 特定ファイルを明示的に指定
git add path/to/file.ts
git add src/components/Button.tsx src/hooks/useAuth.ts

# 推奨: パッチモードで変更箇所を選択
git add -p

# 推奨: 複数ファイルを個別に確認しながら追加
git add -i
```

### 例外: add allが許可されるケース

以下の場合のみ`git add .`の使用を許可:

1. **新規ファイルのみ**: `git status`で新規ファイルのみが表示され、既存ファイルの変更がない場合
2. **単一機能の隔離された変更**: 1つの機能に集中した変更で、関係ないファイルが混入していないことが確認済みの場合
3. **ユーザーの明示的な指示**: ユーザーが「全て追加して」と明確に指示した場合

### 手順（必須）

1. **現状確認**: `git status`で全ての変更を確認
2. **差分確認**: `git diff`で変更内容を確認
3. **選択的ステージング**: 自分が編集したファイルのみを`git add <path>`で追加
4. **ステージング確認**: `git diff --staged`でステージング内容を確認
5. **コミット実行**: 内容に問題がなければコミット

### チェックリスト

ステージング前に以下を確認:

- [ ] 他人が編集した可能性のあるファイルが含まれていないか
- [ ] デバッグ用の一時コードが含まれていないか
- [ ] 機密情報（.env、credentials等）が含まれていないか
- [ ] 関係ないフォーマット修正が混入していないか
- [ ] ビルド成果物やキャッシュが含まれていないか

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

**重要**: `git add .`や`git add -A`は安易に使用せず、自分が編集したファイルのみをステージングすること。

```bash
# 推奨: 特定ファイルを明示的に指定
git add path/to/file

# 推奨: パッチモードで変更箇所を選択
git add -p

# 推奨: インタラクティブモード
git add -i

# 注意: 以下は原則として使用禁止
# git add .     # カレントディレクトリ以下の全ファイル
# git add -A    # ワーキングツリー全体
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
- [references/commit-message-guide.md](references/commit-message-guide.md) - コミットメッセージガイドライン（詳細）

## 使用例

### 例1: 機能ブランチでの作業

```bash
# 新規ブランチ作成
git checkout -b feature/new-feature

# 変更を確認
git status

# 自分が編集したファイルのみステージング（git add .は使用禁止）
git add src/feature/new-feature.ts
git add tests/feature/new-feature.test.ts

# ステージング内容を確認
git diff --staged

# コミット
git commit -m "feat: 新機能を追加する"

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

# 解決したファイルのみをステージング（git add .は使用禁止）
git add path/to/file

# コミット
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

1. **選択的ステージング**: `git add .`を安易に使わず、自分が編集したファイルのみを明示的に指定する
2. **コミットメッセージ規約**: Conventional Commitsに準拠する
3. **頻繁にコミット**: 小さな論理単位でコミットする
4. **プッシュ前に確認**: `git status` と `git diff --staged` で変更を確認
5. **強制プッシュは慎重**: `--force` ではなく `--force-with-lease` を使用
6. **ブランチ名を明確**: `feature/`, `fix/`, `docs/` などのプレフィックスを使用

## コミットメッセージ規約（CRITICAL）

### 基本方針

- **絵文字は使用しない**
- **日本語で詳細に書く（絶対必須）**
- **Body（本文）を必ず書く**
- **英語でのコミットメッセージは禁止**

### フォーマット

```
<Type>[(scope)]: #<Issue Number> <Title>

<Body>

<Footer>
```

**構成:**

| 要素 | 必須度 | 説明 |
|------|--------|------|
| Type | 必須 | コミットの種別 |
| (scope) | 任意 | 影響範囲（api, ui, db等） |
| Issue Number | 強く推奨 | 紐づくIssue番号 |
| Title | 必須 | 変更内容の要約（50文字以内） |
| Body | **必須** | 詳細な説明（What, Why, How） |
| Footer | 任意 | 参照情報、レビュー者等 |

### Type一覧

| Type | 説明 |
|------|------|
| `feat` | ユーザー向けの機能追加・変更 |
| `fix` | ユーザー向けの不具合修正 |
| `docs` | ドキュメント更新 |
| `style` | フォーマット・スタイル修正 |
| `refactor` | リファクタリング |
| `test` | テストコード追加・修正 |
| `chore` | プロダクション影響のない修正 |
| `perf` | パフォーマンス改善 |
| `ci` | CI設定の変更 |

### タイトルのルール

- **現在形で書く**: 「◯◯した」ではなく「◯◯する」
- **50文字以内**: ツール互換性のため
- **具体的に**: 「機能追加」「バグ修正」等の曖昧な表現は避ける
- **絵文字禁止**: 絵文字は使用しない

### Bodyのルール（重要）

**Bodyは必ず書く。以下の内容を含める:**

1. **What（何を）**: どのような変更をしたか
2. **Why（なぜ）**: なぜこの変更が必要だったか
3. **How（どう）**: どのように実装したか（重要な場合）
4. **テスト方法**: どうテストしたか
5. **影響範囲**: 他に影響する部分はあるか

**Bodyの書き方:**
- 72文字で折り返す
- 空行で段落を分ける
- 箇条書きを使ってもよい

### 良いコミットメッセージ例

```
feat(auth): #123 ユーザー認証にJWTを導入する

## 背景
現在のセッション認証は複数サーバー間で共有できないため、
スケールアウト時に問題が発生していた。
また、モバイルアプリとの連携でもセッション管理が複雑になっていた。

## 変更内容
- Passport.jsによるJWT認証を実装
- アクセストークン（15分）とリフレッシュトークン（7日）の二層構造
- トークン無効化用のブラックリストをRedisに実装
- 既存のセッション認証コードを削除

## テスト方法
1. ユーザー登録: POST /api/auth/register
2. ログイン: POST /api/auth/login
3. トークン確認: GET /api/auth/me (Authorization: Bearer <token>)
4. トークン更新: POST /api/auth/refresh
5. ログアウト: POST /api/auth/logout

## 影響範囲
- 既存ユーザーは再ログインが必要
- モバイルアプリ側の対応が必要（別PR #125）

reviewed-by: 田中さん
related-pr: #125
```

```
fix(api): #89 決済処理のタイムアウトエラーを修正する

## 問題
本番環境で、処理に30秒以上かかる決済リクエストが
タイムアウトエラー（504）になっていた。
カスタマーサポートに多数の問い合わせが来ていた。

## 原因
API Gatewayのタイムアウト設定が30秒になっていた。
決済代行のAPIが混雑時に25〜40秒かかる場合があった。

## 対策
- API Gatewayのタイムアウトを60秒に延長
- 決済API呼び出し前にタイムアウト警告ログを出力
- フロントエンドのローディング表示を60秒に延長

## テスト方法
- 負荷テストツールで40秒のレスポンスを模擬
- 本番環境と同じ設定のステージングで確認

## デプロイ先
dev-60（dev-59はDB不整合のため使用不可）
本番反映は来週のリリース予定

resolves: #89
```

### 悪いコミットメッセージ例

```
feat: 機能追加
```
→ 何を追加したか不明、Bodyがない

```
fix: バグ修正
```
→ どのバグをどう修正したか不明

```
feat: ✨ #123 ログイン機能を実装する
```
→ 絵文字を使用している

```
feat(auth): add JWT authentication
```
→ **英語で書かれている（NG）**

```
fix: fixed timeout error in payment API
```
→ **英語で書かれている（NG）**

```
chore: いろいろ修正
```
→ 具体性がない、Bodyがない

### テンプレート

```
<Type>[(scope)]: #<Issue Number> <Title>

## 背景
<なぜこの変更が必要か>

## 変更内容
<具体的な変更点>

## テスト方法
<どうテストしたか>

## 影響範囲
<他に影響する部分>

<Footer>
```

**詳細ガイド**: [references/commit-message-guide.md](references/commit-message-guide.md)

---

*このスキルはoh-my-zsh git pluginをベースに作成されました。*

---

## デバッグ情報

### 記録されるイベント

このスキルの実行時に記録されるイベント：

| イベント種別 | 説明 | 記録タイミング |
|-------------|------|---------------|
| session_start | セッション開始 | pi起動時 |
| task_start | タスク開始 | ユーザー依頼受付時 |
| operation_start | 操作開始 | スキル実行開始時 |
| operation_end | 操作終了 | スキル実行完了時 |
| task_end | タスク終了 | タスク完了時 |

### ログ確認方法

```bash
# 今日のログを確認
cat .pi/logs/events-$(date +%Y-%m-%d).jsonl | jq .

# 特定の操作を検索
cat .pi/logs/events-*.jsonl | jq 'select(.eventType == "operation_start")'

# エラーを検索
cat .pi/logs/events-*.jsonl | jq 'select(.data.status == "failure")'
```

### トラブルシューティング

| 症状 | 考えられる原因 | 確認方法 | 解決策 |
|------|---------------|---------|--------|
| 実行が停止する | タイムアウト | ログのdurationMsを確認 | タイムアウト設定を増やす |
| 結果が期待と異なる | 入力パラメータの問題 | paramsを確認 | 入力を修正して再実行 |
| エラーが発生する | リソース不足 | エラーメッセージを確認 | 設定を調整 |

### 関連ファイル

- 実装: `.pi/extensions/git-workflow.ts`
- ログ: `.pi/logs/events-YYYY-MM-DD.jsonl`
