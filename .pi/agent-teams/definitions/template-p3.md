---
id: template-p3
name: Template - Phase 3 [Name]
description: "Template Phase 3: [フェーズ名]。Phase 1/2の結果を受け取り、最終的な[成果物]を作成・検証する。"
enabled: disabled
strategy: parallel
members:
  - id: reviewer-1
    role: Reviewer 1
    description: "[レビュー担当1の説明]"
    enabled: true
  - id: reviewer-2
    role: Reviewer 2
    description: "[レビュー担当2の説明]"
    enabled: true
---

# Template - Phase 3: [Phase Name]

## チームミッション

Phase 3（[フェーズ名]）を担当。Phase 1/2（template-p1, template-p2）の結果を受け取る。

**前提:** Phase 1/2の結果を受け取っていること。

**出力:** 最終的な成果物。

## Input from Phase 1 & 2

- Phase 1: [内容]
- Phase 2: [内容]

## Output Format

```
SUMMARY: [サマリー]
CLAIM: [最終判定]
EVIDENCE: [Phase 1/2結果への参照]
CONFIDENCE: [0.00-1.00]
RESULT:
## [セクション]
- [内容]

## 最終判定
- [ ] 完了
- [ ] 要対応: [内容]
NEXT_STEP: [判定に基づく次のアクション]
```
