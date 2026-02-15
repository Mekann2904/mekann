---
id: mermaid-diagram-p2
name: Mermaid Diagram - Phase 2 Authoring
description: "Mermaid Diagram Phase 2: 図式作成フェーズ。Phase 1の解析結果に基づき、Mermaid記法でシーケンス図、フローチャート等を作成する。結果はPhase 3（構文検証）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: diagram-creator
    role: Diagram Creator
    description: "図作成担当。解析結果に基づきMermaid記法で図を作成する。可読性と正確性のバランスを取る。"
    enabled: true
  - id: label-designer
    role: Label Designer
    description: "ラベル設計担当。ノード、エッジのラベルを設計し、開発者とLLMの双方が理解できる表現にする。"
    enabled: true
---

# Mermaid Diagram - Phase 2: Authoring

## チームミッション

Mermaid DiagramのPhase 2（図式作成）を担当。Phase 1（mermaid-diagram-p1）の解析結果に基づき図を作成する。

**前提:** Phase 1の解析結果を受け取っていること。

**出力:** 作成した図は Phase 3（mermaid-diagram-p3）に引き継がれる。

## Output Format

```
SUMMARY: [図式作成サマリー]
CLAIM: [作成した図の種類と目的]
EVIDENCE: [Phase 1の解析結果への参照]
CONFIDENCE: [0.00-1.00]
RESULT:
## 作成した図
```mermaid
[Mermaidコード]
```
NEXT_STEP: Phase 3（mermaid-diagram-p3）で構文検証
```
