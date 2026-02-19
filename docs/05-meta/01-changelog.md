---
title: 変更履歴
category: meta
audience: new-user, daily-user, developer, contributor
last_updated: 2026-02-14
tags: [changelog]
related: [../../CHANGELOG.md]
---

# 変更履歴

> パンくず: [Home](../../README.md) > [Meta](./) > 変更履歴

pi拡張機能コレクションの詳細な変更履歴です。

> **注**: ルートの [CHANGELOG.md](../../CHANGELOG.md) は簡潔版です。ここには詳細な変更記録が含まれています。

## [v0.2.1] - 2026-02-14

### 追加
- **skill-inspector拡張機能**
  - `skill_status` ツール: 現在のスキル割り当て状況を表示
  - `/skill-status` コマンド: スキル情報のクイックアクセス

- **新しいエージェントチーム**
  - `mermaid-diagram-team`: コード視覚化タスクフォース（シーケンス図、フローチャート等）
  - `research-team`: データ分析・科学研究プロジェクト専用チーム

### ドキュメント
- README.mdのチーム一覧に design-discovery-team, file-organizer-team, mermaid-diagram-team, research-team を追加
- README.mdのスキル数を正確な27個に更新
- docs/02-user-guide/09-agent-teams.md に mermaid-diagram-team, research-team の詳細を追加
- docs/02-user-guide/08-subagents.md に skills パラメータの説明を追加

---

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
- `TEAM_DEFAULTS_VERSION` を 2 -> 3 に更新

### 改善
- 長いプロンプトの記述性向上（Markdown 形式）
- 新しいチーム追加の障壁低減（1ファイル追加のみ）
- チーム定義のバージョン管理（Git での差分表示が容易）

### ドキュメント
- `docs/agent-teams-reference.md` に「新しいチームを追加する」セクションを追加
- `README.md` のプロジェクト構造を更新

---

## [v0.1.0] - 2026-02-10

### 初期リリース

#### コア拡張機能
- **question**: インタラクティブUIでユーザー選択
- **loop_run**: 自律ループ実行
- **fzf**: Fuzzy finder統合
- **abbr**: 略語管理

#### オーケストレーション
- **plan_***: 計画管理とタスク追跡
- **subagent_***: サブエージェント
- **agent_team_***: エージェントチーム
- **ul-dual-mode**: デュアルモード強制実行

#### ユーティリティ
- **usage-tracker**: LLM使用状況の追跡
- **agent-usage-tracker**: 拡張機能の使用統計
- **context-dashboard**: コンテキスト使用量ダッシュボード
- **agent-idle-indicator**: エージェント実行状態の表示
- **kitty-status-integration**: kittyターミナル連携

---

## バージョン命名規則

- **Major**: 破壊的な変更
- **Minor**: 新機能の追加
- **Patch**: バグ修正

---

## 関連トピック

- [Documentation Policy](./02-documentation-policy.md) - ドキュメント管理方針
- [Roadmap](./03-roadmap.md) - ロードマップ
