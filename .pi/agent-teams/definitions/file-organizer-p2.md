---
id: file-organizer-p2
name: File Organizer - Phase 2 Plan
description: "File Organizer Phase 2: 整理計画策定フェーズ。Phase 1の分析結果に基づき、新しいフォルダ構造を提案し、変更内容、命名規則を文書化する。結果はPhase 3（実行）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: structure-designer
    role: Structure Designer
    description: "構造設計担当。ファイルタイプ、目的に基づいて論理的なグループ化を決定し、新しいフォルダ構造を提案する。"
    enabled: true
  - id: naming-designer
    role: Naming Designer
    description: "命名規則設計担当。一貫性のある命名規則を策定し、適用ルールを文書化する。"
    enabled: true
  - id: change-planner
    role: Change Planner
    description: "変更計画担当。具体的な移動・名前変更操作を計画し、リスク評価を行う。"
    enabled: true
---

# File Organizer - Phase 2: Planning

## チームミッション

File OrganizerのPhase 2（整理計画策定）を担当。Phase 1（file-organizer-p1）の分析結果に基づき、整理計画を策定する。

**前提:** Phase 1の分析結果を受け取っていること。

**出力:** 整理計画は Phase 3（file-organizer-p3）に引き継がれる。

## Output Format

```
SUMMARY: [整理計画サマリー]
CLAIM: [提案する新しい構造]
EVIDENCE: [Phase 1の分析結果への参照]
CONFIDENCE: [0.00-1.00]
RESULT:
## 新しいフォルダ構造
[構造図]

## 命名規則
- [規則1]
- [規則2]

## 変更計画
1. [操作1]: [詳細]
2. [操作2]: [詳細]

## リスク評価
- [リスク1]: [対策]
NEXT_STEP: Phase 3（file-organizer-p3）で実行と検証
```
