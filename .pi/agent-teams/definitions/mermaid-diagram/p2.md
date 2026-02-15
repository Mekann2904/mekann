---
id: mermaid-diagram-p2
name: Mermaid Diagram - Phase 2 Authoring
description: "Mermaid Diagram Phase 2: 図式作成フェーズ。Phase 1の解析結果に基づき、Mermaid記法でシーケンス図、フローチャート等を作成する。結果はPhase 3（構文検証）に引き継ぐ。"
enabled: enabled
strategy: parallel
triggers:
  - Phase 1完了後の解析結果
skip_conditions:
  - Phase 1の解析結果未受領（Phase 1に戻る）
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

**核心原則:** 可読性と正確性のバランスを取る。正確性を犠牲にして可読性を追求しない。

**鉄の掟:**
```
正確性を犠牲にして可読性を追求しない
```

**前提:** Phase 1の解析結果を受け取っていること。

**出力:** 作成した図は Phase 3（mermaid-diagram-p3）に引き継がれる。

## When to Use

Phase 1完了後、必ず実施:
- Mermaid記法での図作成
- 開発者とLLMの双方が理解できる表現

**スキップしてはならない:**
- 「可読性のために条件を単純化しよう」→ 単純化は歪曲を生む
- 「図が複雑になるから一部省略」→ 複雑さは現実

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

## 警告信号 - プロセスの遵守を促す

以下のような考えが浮かんだら、それはSTOPのサイン:
- 「可読性のために条件を単純化しよう」
- 「この名前は大体合っている」
- 「図が複雑になるから一部省略」

**これらすべては: STOP。Phase 2を完了せよ。**

## 人間のパートナーの「やり方が間違っている」シグナル

**以下の方向転換に注意:**
- 「この図、コードと合っている？」 - 整合性への疑念
- 「この処理、図にないけど？」 - 欠落の指摘

**これらを見たら:** STOP。Phase 2を完了せよ。

## よくある言い訳

| 言い訳 | 現実 |
|--------|------|
| 「可読性のため単純化」 | 単純化は歪曲を生む。正確性を優先。 |
| 「大体合っている名前」 | 大体はtypo。正確な名前を使用。 |
| 「複雑になるから省略」 | 複雑さは現実。図は複雑さを可視化するもの。 |
