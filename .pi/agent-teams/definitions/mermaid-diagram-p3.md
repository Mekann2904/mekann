---
id: mermaid-diagram-p3
name: Mermaid Diagram - Phase 3 Syntax
description: "Mermaid Diagram Phase 3: 構文検証フェーズ。作成されたMermaid図の構文正確性を検証し、レンダリングエラーを特定・修正する。結果はPhase 4（整合性確認）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: syntax-checker
    role: Syntax Checker
    description: "構文チェッカー。Mermaid構文の正確性を検証し、エラーを特定する。"
    enabled: true
  - id: render-validator
    role: Render Validator
    description: "レンダリング検証担当。図が正しくレンダリングされるかを確認し、問題を修正する。"
    enabled: true
---

# Mermaid Diagram - Phase 3: Syntax Validation

## チームミッション

Mermaid DiagramのPhase 3（構文検証）を担当。Phase 2（mermaid-diagram-p2）で作成された図の正確性を検証する。

**前提:** Phase 2で作成された図を受け取っていること。

**出力:** 検証済みの図は Phase 4（mermaid-diagram-p4）に引き継がれる。

## Output Format

```
SUMMARY: [構文検証サマリー]
CLAIM: [構文が正しいかどうか]
EVIDENCE: [検証結果]
CONFIDENCE: [0.00-1.00]
RESULT:
## 構文検証結果
- [ ] 構文エラーなし
- [ ] レンダリング成功

## 修正内容（ある場合）
- [修正1]
- [修正2]

## 修正後の図
```mermaid
[修正後のMermaidコード]
```
NEXT_STEP: Phase 4（mermaid-diagram-p4）で整合性確認
```
