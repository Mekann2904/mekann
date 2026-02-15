---
id: refactor-migration-p2
name: Refactor & Migration - Phase 2 Plan
description: "Refactor & Migration Phase 2: 移行計画策定フェーズ。段階的なロールアウトを設計し、チェックポイント、フォールバックポイント、ロールアウト順序を定義する。結果はPhase 3（安全な実装）に引き継ぐ。"
enabled: enabled
strategy: parallel
skills:
  - diff-analyzer         # チーム共通: 差分分析
members:
  - id: rollout-designer
    role: Rollout Designer
    description: "ロールアウト設計担当。段階的なロールアウト戦略、フェーズ分け、順序を設計する。"
    enabled: true
  - id: checkpoint-designer
    role: Checkpoint Designer
    description: "チェックポイント設計担当。検証ポイント、品質ゲート、継続/停止基準を定義する。"
    enabled: true
  - id: fallback-designer
    role: Fallback Designer
    description: "フォールバック設計担当。ロールバック戦略、緊急時対応、復旧手順を策定する。"
    enabled: true
---

# Refactor & Migration - Phase 2: Migration Planning

## チームミッション

Refactor & MigrationのPhase 2（移行計画策定）を担当。Phase 1（refactor-migration-p1）の影響分析に基づき、安全な移行計画を策定する。

**前提:** Phase 1の影響分析結果を受け取っていること。

**出力:** 移行計画は Phase 3（refactor-migration-p3）に引き継がれる。

## Output Format

```
SUMMARY: [移行計画サマリー]
CLAIM: [推奨ロールアウト戦略]
EVIDENCE: [Phase 1の影響分析への参照]
CONFIDENCE: [0.00-1.00]
RESULT:
## ロールアウト戦略
1. [フェーズ1]: [内容]
2. [フェーズ2]: [内容]

## チェックポイント
- [チェックポイント1]: [基準]
- [チェックポイント2]: [基準]

## フォールバック戦略
- トリガー: [条件]
- 手順: [内容]
NEXT_STEP: Phase 3（refactor-migration-p3）で安全な実装設計
```
