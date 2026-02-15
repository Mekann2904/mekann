---
id: template-team-guide
name: Phase-Separated Team Template Guide
description: フェーズ分割パターンのチーム作成ガイド。template-p1, template-p2, template-p3をコピーして新しいチームセットを作成する手順を説明。
enabled: disabled
members: []
---

# Phase-Separated Team Template Guide

## 概要

このガイドは、フェーズ分割パターンでチームを作成するためのテンプレートと手順を説明します。

## フェーズ分割パターンとは

従来の単一チーム・並列実行パターンの問題：
- Phase 1/2/3のメンバーが同時に開始
- 前フェーズの結果なしで作業を開始してしまう
- 重複作業が発生

フェーズ分割パターンでの解決：
- フェーズごとに独立したチームを作成
- 各フェーズを順次実行
- 前フェーズの結果を次フェーズに引き継ぎ

## テンプレートファイル

| ファイル | 用途 |
|---------|------|
| `template-p1.md` | Phase 1用テンプレート |
| `template-p2.md` | Phase 2用テンプレート |
| `template-p3.md` | Phase 3用テンプレート |

## 新規チーム作成手順

### 1. チーム名を決定

例: `my-feature`

### 2. 各フェーズのテンプレートをコピー

```bash
cp template-p1.md my-feature-p1.md
cp template-p2.md my-feature-p2.md
cp template-p3.md my-feature-p3.md
```

### 3. 各ファイルを編集

#### my-feature-p1.md

```yaml
---
id: my-feature-p1
name: My Feature - Phase 1 [Name]
description: "My Feature Phase 1: [フェーズ名]..."
enabled: enabled  # 有効化
strategy: parallel
members:
  - id: [適切なID]
    role: [役割名]
    description: "[説明]"
---
```

#### my-feature-p2.md

```yaml
---
id: my-feature-p2
name: My Feature - Phase 2 [Name]
description: "My Feature Phase 2: [フェーズ名]..."
enabled: enabled
---
```

#### my-feature-p3.md

```yaml
---
id: my-feature-p3
name: My Feature - Phase 3 [Name]
description: "My Feature Phase 3: [フェーズ名]..."
enabled: enabled
---
```

### 4. 使い方

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
| チームID | `[ベース名]-p[フェーズ番号]` | `core-delivery-p1` |
| チーム名 | `[ベース名] - Phase N [フェーズ名]` | `Core Delivery - Phase 1 Investigation` |
| メンバーID | `[役割を表す名]` | `research-primary` |

## 参考実装

以下のチームを参考にしてください：

| チーム | フェーズ数 | 特徴 |
|-------|----------|------|
| core-delivery | 3 | 汎用開発フロー |
| bug-war-room | 4 | デバッグフロー |
| code-excellence | 3 | レビューフロー |
| design-discovery | 3 | 設計フロー |
