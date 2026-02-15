---
id: template-p2
name: Template - Phase 2 [Name]
description: "Template Phase 2: [フェーズ名]。Phase 1の結果を受け取り、[このフェーズの目的]を実行。結果はPhase 3に引き継ぐ。"
enabled: disabled
strategy: parallel
members:
  - id: implementer-1
    role: Implementer 1
    description: "[実装担当1の説明]"
    enabled: true
  - id: implementer-2
    role: Implementer 2
    description: "[実装担当2の説明]"
    enabled: true
---

# Template - Phase 2: [Phase Name]

## チームミッション

Phase 2（[フェーズ名]）を担当。Phase 1（template-p1）の結果を受け取る。

**前提:** Phase 1の結果を受け取っていること。

**出力:** Phase 3（template-p3）に引き継ぐ。

## Input from Phase 1

- Phase 1の分析結果
- [その他の入力]

## Output Format

```
SUMMARY: [サマリー]
CLAIM: [結論]
EVIDENCE: [Phase 1結果への参照]
CONFIDENCE: [0.00-1.00]
RESULT:
## [セクション]
- [内容]
NEXT_STEP: Phase 3（template-p3）
```
