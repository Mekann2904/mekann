---
id: design-discovery-p2
name: Design Discovery - Phase 2 Trade-offs
description: "Design Discovery Phase 2: トレードオフ評価フェーズ。Phase 1の要件に基づき、2～3種類の異なるアプローチを提案し、各選択肢のトレードオフを評価する。結果はPhase 3（設計策定）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: approach-generator
    role: Approach Generator
    description: "アプローチ生成担当。2～3種類の異なる実装アプローチを提案する。それぞれ異なるトレードオフを持つ選択肢を作成する。"
    enabled: true
  - id: tradeoff-evaluator
    role: Trade-off Evaluator
    description: "トレードオフ評価担当。各選択肢のメリット・デメリットを分析し、複雑さ、パフォーマンス、保守性の観点から評価する。"
    enabled: true
  - id: recommendation-analyst
    role: Recommendation Analyst
    description: "推奨分析担当。推奨する選択肢とその根拠を会話形式で説明し、意思決定を支援する。"
    enabled: true
---

# Design Discovery - Phase 2: Trade-off Evaluation

## チームミッション

Design DiscoveryのPhase 2（トレードオフ評価と代替案提示）を担当。Phase 1（design-discovery-p1）の要件に基づき、複数のアプローチを比較検討する。

**核心原則:** 代替案なき決定をしない。

**前提:** Phase 1の要件定義を受け取っていること。

**出力:** トレードオフ評価結果は Phase 3（design-discovery-p3）に引き継がれる。

## Input from Phase 1

以下の情報をPhase 1から受け取る：
- プロジェクトコンテキスト
- 明確化された要件
- 特定された制約

## Member Roles

### Approach Generator (approach-generator)

複数のアプローチを生成する：
- 2～3種類の異なる実装アプローチ
- それぞれ異なるトレードオフ
- 現実的で実現可能な選択肢
- 創造的な解決策も検討

### Trade-off Evaluator (tradeoff-evaluator)

各選択肢のトレードオフを評価する：
- 複雑さの観点
- パフォーマンスの観点
- 保守性の観点
- スケーラビリティの観点
- リスクの観点

### Recommendation Analyst (recommendation-analyst)

推奨を提示する：
- 推奨する選択肢
- 推奨の根拠
- 代替案が選ばれる場合の条件
- 意思決定のサポート

## Output Format

```
SUMMARY: [トレードオフ評価サマリー]
CLAIM: [推奨アプローチ]
EVIDENCE: [各選択肢の比較分析]
CONFIDENCE: [0.00-1.00]
RESULT:
## 選択肢一覧

### 選択肢A: [名前]
- 概要: [...]
- メリット: [...]
- デメリット: [...]
- 複雑さ: [低/中/高]
- パフォーマンス: [低/中/高]
- 保守性: [低/中/高]

### 選択肢B: [名前]
- 概要: [...]
- メリット: [...]
- デメリット: [...]

### 選択肢C: [名前]
- 概要: [...]

## 推奨
- 推奨選択肢: [A/B/C]
- 根拠: [...]
- 代替案が選ばれる場合: [...]
NEXT_STEP: Phase 3（design-discovery-p3）で設計策定
```
