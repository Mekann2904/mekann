---
id: rapid-swarm-p3
name: Rapid Swarm - Phase 3 Synthesis
description: "Rapid Swarm Phase 3: 統合と実行計画フェーズ。Phase 1/2の並列分析結果を統合し、重複を除去して一つの実行計画を作成する。"
enabled: enabled
strategy: parallel
members:
  - id: result-integrator
    role: Result Integrator
    description: "結果統合担当。Phase 1/2の並列ワーカーの出力を統合し、重複を除去する。"
    enabled: true
  - id: conflict-resolver
    role: Conflict Resolver
    description: "矛盾解決担当。異なる視点からの意見を比較し、矛盾を解決する。"
    enabled: true
  - id: plan-formulator
    role: Plan Formulator
    description: "計画策定担当。統合された情報に基づき、矛盾のないアクションプランを導き出す。"
    enabled: true
---

# Rapid Swarm - Phase 3: Synthesis & Planning

## チームミッション

Rapid SwarmのPhase 3（統合と実行計画）を担当。Phase 1/2（rapid-swarm-p1, rapid-swarm-p2）の分析結果を統合する。

**前提:** Phase 1/2の分析結果を受け取っていること。

**出力:** 最終的な実行計画。

## Output Format

```
SUMMARY: [統合サマリー]
CLAIM: [推奨アクション]
EVIDENCE: [Phase 1/2の分析結果への参照]
CONFIDENCE: [0.00-1.00]
RESULT:
## 統合された発見
- [発見1]
- [発見2]

## 解決された矛盾
- [矛盾1]: [解決方法]

## 実行計画
1. [ステップ1]
2. [ステップ2]
3. [ステップ3]
NEXT_STEP: 実行
```
