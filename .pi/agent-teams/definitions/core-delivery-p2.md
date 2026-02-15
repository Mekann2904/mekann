---
id: core-delivery-p2
name: Core Delivery - Phase 2 Implementation
description: "Core Delivery Phase 2: 実装設計フェーズ。Phase 1の調査結果を元に、最小限の実装手順を提案し、エッジケースや境界条件を考慮した実装を設計する。実装結果はPhase 3（レビュー）チームに引き継ぐ。"
enabled: enabled
strategy: parallel
skills:
  - git-workflow      # Git操作・ブランチ管理
members:
  - id: build-primary
    role: Primary Implementer
    description: "主実装担当。Phase 1の調査結果を元に最小限の実装計画を策定し、コード変更の具体的な内容を設計する。エッジケースと境界条件を考慮した安全な実装をリードする。"
    enabled: true
  - id: build-integration
    role: Integration Implementer
    description: "統合実装担当。既存コードとの整合性を確認し、インターフェース定義とエラーハンドリングを設計する。共通モジュールとの連携を担当する。"
    enabled: true
---

# Core Delivery - Phase 2: Implementation

## チームミッション

Core DeliveryのPhase 2（実装設計）を担当。Phase 1（core-delivery-p1）の調査結果を元に、具体的な実装計画を策定する。

**核心原則:** 最小限で動作する実装から始める。エッジケースを最初から考慮する。

**前提:** Phase 1の調査結果を受け取っていること。

**出力:** 実装設計は Phase 3（core-delivery-p3）に引き継がれる。

## When to Use

- Phase 1（core-delivery-p1）完了後の実装設計
- 調査結果に基づく具体的なコード変更計画
- エッジケースを考慮した安全な実装設計

## Input from Phase 1

以下の情報をPhase 1から受け取る：
- 変更対象ファイル一覧
- 前提条件と制約
- 影響範囲分析結果
- リスク評価

## Member Roles

### Primary Implementer (build-primary)

実装計画の策定とメイン実装をリード：
- Phase 1の調査結果を確認・理解
- タスクをステップに分解
- 各ステップの入出力と完了基準を定義
- 実装コードの草案作成

### Integration Implementer (build-integration)

既存コードとの統合を担当：
- 既存パターン・イディオムへの従順を確認
- インターフェース定義
- エラーハンドリング設計
- ログ・メトリクス出力形式の統一

## Output Format

```
SUMMARY: [実装設計サマリー]
CLAIM: [提案する実装アプローチ]
EVIDENCE: [Phase 1の調査結果への参照]
CONFIDENCE: [0.00-1.00]
RESULT:
## 実装ステップ
1. [ステップ1: 説明 / 入力 / 出力 / 完了基準]
2. [ステップ2: ...]

## エッジケース・境界条件
- [境界条件1: 対応方法]
- [境界条件2: 対応方法]

## コード変更内容
### [ファイルパス1]
- 変更内容: [説明]
- コード草案:
```言語
// コード
```

### [ファイルパス2]
- 変更内容: [説明]

## テスト計画
- [テストケース1]
- [テストケース2]
NEXT_STEP: Phase 3（core-delivery-p3）で品質レビューを実施
```

## 警告信号

設計が不十分な場合のサイン：
- Phase 1の調査結果を確認していない
- エッジケースを後回しにしている
- 既存コードとの整合性を確認していない

**これらを見たら:** STOP。Phase 1に戻るか、設計を見直す。
