---
id: template-p1
name: Template - Phase 1 [Name]
description: "Template Phase 1: [フェーズ名]。このフェーズの目的を記述。結果はPhase 2に引き継ぐ。新規チーム作成時はこのテンプレートをコピーして編集。"
enabled: disabled
strategy: parallel
members:
  - id: analyst-1
    role: Analyst 1
    description: "[分析担当1の説明]"
    enabled: true
  - id: analyst-2
    role: Analyst 2
    description: "[分析担当2の説明]"
    enabled: true
---

# Template - Phase 1: [Phase Name]

## チームミッション

Phase 1（[フェーズ名]）を担当。

**核心原則:** [原則]

**出力:** Phase 2（template-p2）に引き継ぐ。

## Output Format

```
SUMMARY: [サマリー]
CLAIM: [結論]
EVIDENCE: [根拠]
CONFIDENCE: [0.00-1.00]
RESULT:
## [セクション]
- [内容]
NEXT_STEP: Phase 2（template-p2）
```
