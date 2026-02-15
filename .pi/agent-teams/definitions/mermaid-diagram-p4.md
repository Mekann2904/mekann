---
id: mermaid-diagram-p4
name: Mermaid Diagram - Phase 4 Consistency
description: "Mermaid Diagram Phase 4: 整合性確認フェーズ。Mermaid図と元のコードの厳密な一致を検証する。欠落、過剰、歪曲がないことを確認し、図が正確にコードを表現していることを保証する。"
enabled: enabled
strategy: parallel
members:
  - id: completeness-checker
    role: Completeness Checker
    description: "完全性チェッカー。図に重要な要素が欠落していないかを確認する。"
    enabled: true
  - id: accuracy-checker
    role: Accuracy Checker
    description: "正確性チェッカー。図とコードの対応関係を検証し、歪曲がないかを確認する。"
    enabled: true
  - id: final-approver
    role: Final Approver
    description: "最終承認担当。図が正確にコードを表現していることを保証し、最終判定を行う。"
    enabled: true
---

# Mermaid Diagram - Phase 4: Consistency Verification

## チームミッション

Mermaid DiagramのPhase 4（整合性確認）を担当。Phase 3（mermaid-diagram-p3）で検証された図と元のコードの整合性を確認する。

**核心原則:** 図はコードの忠実な表現であること。

**前提:** Phase 1の解析結果、Phase 3の検証済み図を受け取っていること。

**出力:** 最終的な整合性確認結果。

## Output Format

```
SUMMARY: [整合性確認サマリー]
CLAIM: [図が正確にコードを表現しているか]
EVIDENCE: [検証結果]
CONFIDENCE: [0.00-1.00]
RESULT:
## 完全性チェック
- [ ] 重要な要素がすべて含まれている
- 欠落要素: [なし/あり（内容）]

## 正確性チェック
- [ ] 図とコードが一致している
- 不整合: [なし/あり（内容）]

## 最終判定
- [ ] 承認: 図は正確
- [ ] 要修正: [理由]
NEXT_STEP: [判定に基づく次のアクション]
```
