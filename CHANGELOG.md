# 変更履歴

## [v0.2.0] - 2026-02-12

### 追加
- **エージェントチームプロンプトの Markdown 外部化**
  - チーム定義を `.pi/agent-teams/definitions/` 以下の Markdown ファイルで管理
  - YAML frontmatter を使用した型安全な定義フォーマット
  - チームテンプレート (`template-team.md`) の追加
  - 新しいチーム追加ワークフローの文書化

### 変更
- `agent-teams.ts` に Markdown ローダー関数を追加
- `parseFrontmatter` を `@mariozechner/pi-coding-agent` からインポート
- `createDefaultTeams()` を Markdown ファイルからの読み込みに置換
- ハードコードされたチーム定義を `getHardcodedDefaultTeams()` としてフォールバック化
- `TEAM_DEFAULTS_VERSION` を 2 → 3 に更新

### 改善
- 長いプロンプトの記述性向上（Markdown 形式）
- 新しいチーム追加の障壁低減（1ファイル追加のみ）
- チーム定義のバージョン管理（Git での差分表示が容易）

### ドキュメント
- `docs/agent-teams-reference.md` に「新しいチームを追加する」セクションを追加
- `README.md` のプロジェクト構造を更新

---

## [未公開] - 2026-02-11

詳細な変更履歴は [docs/05-meta/01-changelog.md](docs/05-meta/01-changelog.md) を参照してください。

---

## [未公開] - 2026-02-11

### 追加
- Deepwikiスタイルのドキュメント構造
- 読者別ナビゲーションパス（新規ユーザー、日常ユーザー、開発者、貢献者）
- パンくずリストと関連トピックリンク
- メタデータ標準（YAMLフロントマター）

### 変更
- README.mdをポータル化（500行以内に短縮）
- docs/README.mdを強化
- ドキュメント構造を3レベルの階層に再編

### ドキュメントの移動
- インストールガイド → `docs/01-getting-started/02-installation.md`
- クイックスタート → `docs/01-getting-started/01-quick-start.md`
- 初回ステップ → `docs/01-getting-started/03-first-steps.md`
- 拡張機能一覧 → `docs/02-user-guide/01-extensions.md`
- question詳細 → `docs/02-user-guide/02-question.md`
- rsa_solve詳細 → `docs/02-user-guide/03-rsa-solve.md`
- 開発者ガイド → `docs/03-development/01-getting-started.md`

---

## [v0.1.0] - 2026-02-10

### 初期リリース

#### コア拡張機能
- question, rsa_solve, loop_run, fzf, abbr

#### オーケストレーション
- plan_*, subagent_*, agent_team_*, ul-dual-mode

#### ユーティリティ
- usage-tracker, agent-usage-tracker, context-dashboard, agent-idle-indicator, kitty-status-integration

---

## バージョン命名規則

- **Major**: 破壊的な変更
- **Minor**: 新機能の追加
- **Patch**: バグ修正
