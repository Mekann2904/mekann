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

## 核心原則

**鉄の掟:**
```
理解なき実行をしない
計画なき変更を許可しない
```

推測に基づく作業は失敗を招き、品質を低下させる。準備なき実行は手戻りを生み、時間を浪費する。

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

## 警告信号 - プロセスの遵守を促す

以下のような考えが浮かんだら、それはSTOPのサイン:
- 「このフェーズだけで十分だろう」
- 「統合は後でやればいい」
- 「どちらかの意見を採用しよう」
- 「時間がないから並列分析を諦めよう」
- 「この分析は明らかだから省略」

**これらすべては: STOP。Phase 1に戻れ。**

## 人間のパートナーの「やり方が間違っている」シグナル

| シグナル | 意味 | 推奨アクション |
|---------|------|---------------|
| 「もう一方の視点はどうか？」 | 片方の分析に偏っている | 両方の視点を統合 |
| 「これらは矛盾していないか？」 | 統合が不十分 | 統合プロセスを見直す |
| 「前提条件は確認したか？」 | 前提が不明確 | 前提条件を検証 |
| 「具体的なアクションは？」 | 実行可能でない | アクションプランを具体化 |
| 「どちらが優先か？」 | 優先順位付けが不明確 | Critical/Should/Niceで分類 |

## よくある言い辞

| 言い辞 | 現実 | 正しいアプローチ |
|-------|------|-----------------|
| 「このフェーズだけで十分」 | 単一視点は盲点を生む | 複数視点を統合 |
| 「統合は後で」 | 後では文脈を失う | 分析と同時に統合 |
| 「どちらかを採用」 | 統合した最適解がある | 両方を統合 |
| 「並列分析を諦めよう」 | 並列分析の価値は統合にある | 統合を怠らない |
| 「この分析は明らか」 | 自明は主観 | 形式化して確認 |
| 「前提確認の時間がない」 | 前提欠如は手戻りを生む | 前提を必ず確認 |

## クイックリファレンス

| フェーズ | 主要活動 | 成功基準 |
|-------|---------------|------------------|
| **Phase 1** | 担当領域の独立したスライスの分析 | 特定視点からの発見が明確 |
| **Phase 2** | 実装・詳細設計の実行 | 計画に基づく実装が完了 |
| **Phase 3** | 統合・レビュー・品質保証 | 実行可能な統合計画 |
