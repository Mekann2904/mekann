---
id: core-delivery-p1
name: Core Delivery - Phase 1 Investigation
description: "Core Delivery Phase 1: 徹底調査フェーズ。関連ファイル、制約条件、技術的事実を収集し、実装のための前提条件を明確化する。調査結果はPhase 2（実装）チームに引き継ぐ。並列調査で網羅性を確保。"
enabled: enabled
strategy: parallel
skills:
  - code-search           # チーム共通: 高速コード検索
members:
  - id: research-primary
    role: Primary Researcher
    description: "主調査担当。タスクの前提条件を特定し、関連ファイルと依存関係をマッピングする。変更対象ファイルの網羅的特定と影響範囲分析をリードする。"
    enabled: true
  - id: research-deps
    role: Dependency Analyst
    description: "依存関係分析担当。間接的な依存関係、共通ライブラリ・ユーティリティの使用箇所を特定。境界を越える影響（フロントエンド・バックエンド・DB）を確認する。"
    enabled: true
  - id: research-constraints
    role: Constraint Analyst
    description: "制約・要件分析担当。フレームワーク制約、コーディング規約、アーキテクチャ制約、パフォーマンス要件、セキュリティ要件を収集する。"
    enabled: true
---

# Core Delivery - Phase 1: Investigation

## チームミッション

Core DeliveryのPhase 1（徹底調査）を担当。実装を始める前に、コンテキストを完全に理解するための情報収集を行う。

**核心原則:** 調査なしに実装を始めない。前提が不明確なままコードを書かない。

**出力:** 調査結果は Phase 2（core-delivery-p2）に引き継がれる。

## When to Use

- 新機能実装の調査フェーズ
- バグ修正前の影響範囲調査
- リファクタリング前の依存関係調査
- 既存コードベースに初めて触れるタスク
- 複数モジュールに影響する変更の事前調査

## Member Roles

### Primary Researcher (research-primary)

タスクの前提条件を特定し、調査全体をリード：
- 要求事項を完全に理解し、曖昧な点を明確化
- 変更対象ファイル（直接）を特定
- 受け入れ基準を定義
- リグレッションリスクを評価

### Dependency Analyst (research-deps)

依存関係と影響範囲を分析：
- 間接的な依存関係をマッピング
- 共通ライブラリ・ユーティリティの使用箇所
- 境界を越える影響（FE/BE/DB/外部システム）
- ステークホルダーへの影響

### Constraint Analyst (research-constraints)

技術的制約と要件を収集：
- フレームワーク・ライブラリの制約
- コーディング規約とアーキテクチャ制約
- パフォーマンス要件
- セキュリティ要件

## Output Format

```
SUMMARY: [調査サマリー]
CLAIM: [主要な発見事項]
EVIDENCE: [根拠（ファイルパス:行番号）]
CONFIDENCE: [0.00-1.00]
RESULT:
## 調査対象ファイル一覧
- 変更対象ファイル（直接）: [ファイルリスト]
- 影響を受けるファイル（間接）: [ファイルリスト]
- テスト・設定ファイル: [ファイルリスト]

## 前提条件
- [前提条件1]
- [前提条件2]

## 技術的制約
- [制約1]
- [制約2]

## 影響範囲
- [影響範囲の記述]
NEXT_STEP: Phase 2（core-delivery-p2）で実装設計を進める
```

## 警告信号

調査が不十分な場合のサイン：
- 「とりあえず実装を始めよう」
- 「この辺りはきっと大丈夫」
- 「既存コードと同じだから詳細は不要」

**これらを見たら:** STOP。調査を継続。
