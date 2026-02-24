---
title: 自己改善データ基盤
category: reference
audience: developer
last_updated: 2026-02-24
tags: [self-improvement, data-platform, analytics, reflection]
related: [self-improvement/SKILL.md, alma-memory/SKILL.md]
---

# 自己改善データ基盤

エージェントが自分自身を振り返り、継続的に改善するための包括的なデータ基盤。

## 概要

このデータ基盤は、以下の3層アーキテクチャで構成されています：

```
┌─────────────────────────────────────────────────────────────┐
│  気づきレイヤー (Insight Layer)                               │
│  - 哲学的視座（7つ）による解釈                                 │
│  - アクション可能な洞察への変換                                │
│  - 自己認識の深化                                              │
└─────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│  洞察レイヤー (Analysis Layer)                                │
│  - パターン認識・異常検出                                      │
│  - トレンド分析・予測                                          │
│  - 相関関係の発見                                              │
└─────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│  データレイヤー (Data Layer)                                  │
│  - 実行履歴 (run-index)                                       │
│  - 使用統計 (usage-tracker, agent-usage-tracker)              │
│  - パターン (pattern-extraction)                              │
│  - セマンティック (semantic-memory)                            │
└─────────────────────────────────────────────────────────────┘
```

## 使用方法

### コマンド

```bash
# データ基盤のサマリーを表示
/self-reflect summary

# 最新の洞察レポートを表示
/self-reflect insights

# 新しい洞察レポートを生成
/self-reflect generate

# 哲学的視座の一覧を表示
/self-reflect perspectives

# 洞察レポートの履歴を表示
/self-reflect history [limit]

# TUIダッシュボードを起動
/self-dashboard
```

### TUIダッシュボード

`/self-dashboard` コマンドで、視覚的なダッシュボードが起動します：

| キー | 操作 |
|------|------|
| `1` | 概要ビュー（データソースの一覧） |
| `2` | 分析結果ビュー |
| `3` | 哲学的考察ビュー |
| `4` | パターンビュー |
| `5` | 使用統計ビュー |
| `6` | 哲学的視座ビュー |
| `↑/↓` | リストの移動 |
| `r` | データの再読み込み |
| `q` | ダッシュボードを閉じる |

### ツール

```typescript
// データ基盤のサマリーを取得
await self_reflect({ action: "summary" });

// 最新の洞察レポートを取得
await self_reflect({ action: "insights" });

// 新しい洞察レポートを生成
await self_reflect({ action: "generate" });

// 特定の視座で分析
await self_reflect({
  action: "analyze",
  perspective: "deconstruction"
});

// 特定の領域に焦点を当てて分析
await self_reflect({
  action: "analyze",
  focus_area: "error"
});
```

## 7つの哲学的視座

| 視座 | 核心的問い | 実践的ガイド |
|------|-----------|-------------|
| 脱構築 | この概念は何を排除しているか？ | 二項対立・固定観念を検出し、暴力的階層を暴露する |
| スキゾ分析 | この欲望は何を生産しているか？ | 内なるファシズムを検出し、脱領土化を促進する |
| 幸福論 | 私の「善き生」とは何か？ | 快楽主義の罠を回避し、卓越の追求を実践する |
| ユートピア/ディストピア | どのような世界を創っているか？ | 全体主義への警戒と批判的ユートピアの実践 |
| 思考哲学 | 私は「思考」しているか？ | メタ認知と批判的思考の実践 |
| 思考分類学 | どの思考モードを使うべきか？ | 状況に応じた思考モードの選択 |
| 論理学 | この推論は妥当か？ | 誤謬の回避と論理的整合性の維持 |

## 分析カテゴリ

| カテゴリ | 説明 |
|---------|------|
| performance | パフォーマンス関連の洞察 |
| quality | 品質関連の洞察 |
| reliability | 信頼性関連の洞察 |
| efficiency | 効率性関連の洞察 |
| learning | 学習関連の洞察 |
| risk | リスク関連の洞察 |
| opportunity | 機会関連の洞察 |
| pattern | パターン関連の洞察 |
| anomaly | 異常検出の洞察 |
| trend | トレンド関連の洞察 |

## 洞察の重要度

| 重要度 | 説明 |
|--------|------|
| critical | 即座に対処が必要な問題 |
| high | 短期間で対処すべき問題 |
| medium | 中期的に改善すべき問題 |
| low | 情報提供レベルの洞察 |

## データソース

### 実行履歴 (run-index)

サブエージェントとエージェントチームの実行履歴をインデックス化し、キーワード検索を可能にします。

### パターン (pattern-extraction)

成功・失敗パターンを抽出し、再利用可能な知識として蓄積します。

### 使用統計 (usage-tracker, agent-usage-tracker)

ツール使用状況、エラー発生頻度、コンテキスト占有率を追跡します。

### セマンティックメモリ (semantic-memory)

OpenAI Embeddings APIを使用したセマンティック検索を提供します。

## ストレージ場所

```
.pi/
├── memory/
│   ├── run-index.json           # 実行インデックス
│   ├── patterns.json            # 抽出されたパターン
│   ├── semantic-memory.json     # 埋め込みベクトル
│   └── insights/                # 洞察レポート
│       ├── insight-report-YYYY-MM-DDTHH-MM-SS.json
│       └── ...
└── analytics/
    └── agent-usage-stats.json   # 使用統計
```

## 設定

```typescript
interface PlatformConfig {
  enableSemanticAnalysis: boolean;    // セマンティック分析を有効化
  enablePatternAnalysis: boolean;     // パターン分析を有効化
  enableUsageAnalysis: boolean;       // 使用統計分析を有効化
  enablePhilosophicalReflection: boolean; // 哲学的考察を有効化
  maxInsightsPerReport: number;       // レポートあたりの最大洞察数
  dataRetentionDays: number;          // データ保持期間（日）
}
```

## 例

### 定期的な振り返り

```
毎週月曜日に:

1. /self-reflect generate
   → 新しい洞察レポートを生成

2. レポートを確認
   → 分析結果と哲学的考察を読む

3. アクション可能な洞察を実行
   → 優先度の高い改善項目に対処

4. /self-reflect perspectives
   → 哲学的視座を確認し、深い問いを立てる
```

### 特定の問題の調査

```
エラー率が高いと感じたとき:

1. self_reflect({ action: "analyze", focus_area: "error" })
   → エラー関連の分析を実行

2. self_reflect({ action: "analyze", perspective: "deconstruction" })
   → 「エラー」という概念自体を問い直す
```

## 設計思想

### データ → 洞察 → 気づき

このデータ基盤は、単なるデータの集積ではなく、「気づきを生むシステム」として設計されています：

1. **データの収集** - 自動的に実行履歴、使用統計、パターンを収集
2. **分析の実行** - パターン認識、異常検出、トレンド分析を自動実行
3. **気づきの生成** - 哲学的視座による解釈とアクション可能な洞察への変換

### 監視 vs 気づき

このデータ基盤は「監視」ではなく「気づき」を目的としています：

| 監視的アプローチ（回避） | 気づきのアプローチ（推奨） |
|------------------------|--------------------------|
| 「欠陥を探して排除する」 | 「現れているものを認識する」 |
| 常にスキャンする義務 | 気づいたときに認識する |
| 「無欠陥」を理想として課す | 欠陥を現象として観察する |

詳細は `self-improvement` スキルの「監視 vs 気づき」セクションを参照してください。

## 関連ドキュメント

- [self-improvement スキル](../skills/self-improvement/SKILL.md) - 7つの哲学的視座の詳細
- [alma-memory スキル](../skills/alma-memory/SKILL.md) - ALMA論文に基づくメモリ設計
- [ABDD](../skills/abdd/SKILL.md) - 実態駆動開発

## 実装

- ライブラリ: `.pi/lib/self-improvement-data-platform.ts`
- 拡張機能: `.pi/extensions/self-improvement-reflection.ts`
