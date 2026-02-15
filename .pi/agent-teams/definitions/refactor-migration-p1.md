---
id: refactor-migration-p1
name: Refactor & Migration - Phase 1 Impact
description: "Refactor & Migration Phase 1: 影響範囲特定フェーズ。影響を受けるモジュール、依存関係、リスク集中領域をマッピングする。結果はPhase 2（移行計画）に引き継ぐ。"
enabled: enabled
strategy: parallel
skills:
  - diff-analyzer         # チーム共通: 差分分析
  - dependency-mapper     # 依存関係可視化
members:
  - id: module-analyst
    role: Module Analyst
    description: "モジュール分析担当。影響を受けるモジュール、コンポーネント、ファイルを特定する。"
    enabled: true
  - id: dependency-analyst
    role: Dependency Analyst
    description: "依存関係分析担当。直接的・間接的な依存関係をマッピングし、影響チェーンを特定する。"
    enabled: true
  - id: risk-spotter
    role: Risk Spotter
    description: "リスク発見担当。リスク集中領域、複雑な依存、壊れやすい箇所を特定する。"
    enabled: true
---

# Refactor & Migration - Phase 1: Impact Analysis

## チームミッション

Refactor & MigrationのPhase 1（影響範囲特定）を担当。変更の影響を完全に把握する。

**核心原則:** 影響範囲を完全に把握せずに変更を始めない。

**出力:** 影響分析結果は Phase 2（refactor-migration-p2）に引き継がれる。

## Output Format

```
SUMMARY: [影響分析サマリー]
CLAIM: [影響範囲の評価]
EVIDENCE: [依存関係マップ、リスク評価]
CONFIDENCE: [0.00-1.00]
RESULT:
## 影響を受けるモジュール
- [モジュール1]: [影響内容]
- [モジュール2]: [影響内容]

## 依存関係
- [依存1]
- [依存2]

## リスク集中領域
- [リスク1]: [詳細]
- [リスク2]: [詳細]
NEXT_STEP: Phase 2（refactor-migration-p2）で移行計画策定
```
