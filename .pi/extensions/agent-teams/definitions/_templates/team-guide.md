---
id: template-team-guide
name: Phase-Separated Team Template Guide
description: フェーズ分割パターンのチーム作成ガイド。team.md + p1/p2/p3の構造で新しいチームセットを作成する手順を説明。
enabled: disabled
members: []
---

# Phase-Separated Team Template Guide

## 概要

このガイドは、フェーズ分割パターンでチームを作成するためのテンプレートと手順を説明します。

## 重要: ディレクトリ構造ルール

**team.md必須ルール:**
- サブディレクトリに`team.md`（または`TEAM.md`）が存在する場合のみ、`p*.md`が読み込まれます
- `team.md`がない場合、フェーズ別ファイル（p1.md等）は無視されます

```
definitions/
├── [team-name]/
│   ├── team.md     # 統合チーム（必須）
│   ├── p1.md       # Phase 1チーム（team.mdがある場合のみ有効）
│   ├── p2.md       # Phase 2チーム
│   └── p3.md       # Phase 3チーム
```

## フェーズ分割パターンとは

従来の単一チーム・並列実行パターンの問題：
- Phase 1/2/3のメンバーが同時に開始
- 前フェーズの結果なしで作業を開始してしまう
- 重複作業が発生

フェーズ分割パターンでの解決：
- フェーズごとに独立したチームを作成
- 各フェーズを順次実行
- 前フェーズの結果を次フェーズに引き継ぎ

## 核心原則

**鉄の掟:**
```
理解なき実行をしない
計画なき変更を許可しない
```

推測に基づく作業は失敗を招き、品質を低下させる。準備なき実行は手戻りを生み、時間を浪費する。

## テンプレートファイル

| ファイル | 用途 | 必須 |
|---------|------|------|
| `team.md` | 統合チーム定義 | **必須** |
| `p1.md` | Phase 1用テンプレート | 任意 |
| `p2.md` | Phase 2用テンプレート | 任意 |
| `p3.md` | Phase 3用テンプレート | 任意 |

## 新規チーム作成手順

### 1. チーム名を決定

例: `my-feature`

### 2. ディレクトリを作成

```bash
mkdir .pi/extensions/agent-teams/definitions/my-feature
```

### 3. テンプレートをコピー

```bash
# 統合チーム（必須）
cp _templates/team.md my-feature/team.md

# フェーズ別チーム（必要に応じて）
cp _templates/p1.md my-feature/p1.md
cp _templates/p2.md my-feature/p2.md
cp _templates/p3.md my-feature/p3.md
```

### 4. team.mdを編集

```yaml
---
id: my-feature-team
name: "My Feature Team"
description: "My Featureの実装を担当するチーム。Phase 1/2/3で構成。"
enabled: enabled
strategy: parallel
skills:
  - relevant-skill
members:
  - id: overview-member
    role: Overview Member
    description: "統合チームのメンバー"
    enabled: true
---
```

### 5. 各フェーズを編集

#### my-feature/p1.md

```yaml
---
id: my-feature-p1
name: My Feature - Phase 1 [Name]
description: "My Feature Phase 1: [フェーズ名]..."
enabled: enabled
strategy: parallel
members:
  - id: [適切なID]
    role: [役割名]
    description: "[説明]"
---
```

#### my-feature/p2.md

```yaml
---
id: my-feature-p2
name: My Feature - Phase 2 [Name]
description: "My Feature Phase 2: [フェーズ名]..."
enabled: enabled
---
```

#### my-feature/p3.md

```yaml
---
id: my-feature-p3
name: My Feature - Phase 3 [Name]
description: "My Feature Phase 3: [フェーズ名]..."
enabled: enabled
---
```

### 6. 使い方

```javascript
// Phase 1 → Phase 2 → Phase 3 の順次実行
const phase1 = await agent_team_run({
  teamId: "my-feature-p1",
  task: "..."
});

const phase2 = await agent_team_run({
  teamId: "my-feature-p2",
  task: `...\n\nPhase 1 Results:\n${phase1.output}`
});

const phase3 = await agent_team_run({
  teamId: "my-feature-p3",
  task: `...\n\nPhase 1:\n${phase1.output}\n\nPhase 2:\n${phase2.output}`
});
```

## 命名規則

| 要素 | 規則 | 例 |
|-----|------|-----|
| ディレクトリ名 | `[ベース名]` | `core-delivery` |
| 統合チームID | `[ベース名]-team` | `core-delivery-team` |
| フェーズ別ID | `[ベース名]-p[フェーズ番号]` | `core-delivery-p1` |
| 統合チーム名 | `[ベース名] Team` | `Core Delivery Team` |
| フェーズ別名 | `[ベース名] - Phase N [フェーズ名]` | `Core Delivery - Phase 1 Investigation` |
| メンバーID | `[役割を表す名]` | `research-primary` |

## 参考実装

以下のチームを参考にしてください：

| チーム | フェーズ数 | 特徴 |
|-------|----------|------|
| core-delivery | 3 | 汎用開発フロー |
| bug-war-room | 4 | デバッグフロー |
| code-excellence | 3 | レビューフロー |
| design-discovery | 3 | 設計フロー |

## よくある間違い

| 間違い | 結果 | 正しい方法 |
|-------|------|-----------|
| team.mdを作成しない | p*.mdが読み込まれない | 必ずteam.mdを作成 |
| enabled: disabledのまま | チームが表示されない | enabled: enabledに設定 |
| IDにアンダースコア使用 | 一貫性がない | ハイフンを使用 |
| フロントマターなし | パースエラー | ---で囲む |

## クイックリファレンス

| フェーズ | 主要活動 | 成功基準 |
|-------|---------------|------------------|
| **Phase 1** | 担当領域の独立したスライスの分析 | 特定視点からの発見が明確 |
| **Phase 2** | 実装・詳細設計の実行 | 計画に基づく実装が完了 |
| **Phase 3** | 統合・レビュー・品質保証 | 実行可能な統合計画 |
