---
id: skill-creation-p1
name: Skill Creation - Phase 1 Design
description: "Skill Creation Phase 1: 要件定義・設計フェーズ。スキルの目的、使用タイミング、ディレクトリ構造、機能範囲を明確化する。結果はPhase 2（SKILL.md作成）に引き継ぐ。"
enabled: enabled
strategy: parallel
skills:
  - skill-creator         # チーム共通: スキル作成ガイドライン
members:
  - id: requirement-definer
    role: Requirement Definer
    description: "要件定義担当。スキルの目的、使用タイミング、解決する課題を明確化する。"
    enabled: true
  - id: structure-designer
    role: Structure Designer
    description: "構造設計担当。ディレクトリ構造、ファイル構成、命名規約を設計する。"
    enabled: true
  - id: scope-definer
    role: Scope Definer
    description: "範囲定義担当。機能範囲、含まない機能、境界を明確化する。"
    enabled: true
---

# Skill Creation - Phase 1: Design

## チームミッション

Skill CreationのPhase 1（要件定義・設計）を担当。スキル作成の土台を構築する。

**出力:** 設計結果は Phase 2（skill-creation-p2）に引き継がれる。

## Output Format

```
SUMMARY: [設計サマリー]
CLAIM: [スキルの目的と価値]
EVIDENCE: [要件、構造設計]
CONFIDENCE: [0.00-1.00]
RESULT:
## スキルの目的
- [目的]

## 使用タイミング
- [タイミング1]
- [タイミング2]

## ディレクトリ構造
[構造図]

## 機能範囲
- 含む: [...]
- 含まない: [...]
NEXT_STEP: Phase 2（skill-creation-p2）でSKILL.md作成
```
