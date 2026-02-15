---
id: mermaid-diagram-p1
name: Mermaid Diagram - Phase 1 Analysis
description: "Mermaid Diagram Phase 1: コード解析フェーズ。対象コードの構造、制御フロー、データフロー、インターフェースを詳細に分析し、図解に必要な情報を抽出する。結果はPhase 2（図式作成）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: structure-analyzer
    role: Structure Analyzer
    description: "構造分析担当。クラス、関数、モジュールの構造を分析し、関係性を特定する。"
    enabled: true
  - id: flow-analyzer
    role: Flow Analyzer
    description: "フロー分析担当。制御フロー、条件分岐、ループ、例外処理を特定する。"
    enabled: true
  - id: interface-analyzer
    role: Interface Analyzer
    description: "インターフェース分析担当。API、メソッドシグネチャ、データフローを抽出する。"
    enabled: true
---

# Mermaid Diagram - Phase 1: Code Analysis

## チームミッション

Mermaid DiagramのPhase 1（コード解析）を担当。図解に必要な情報を正確に抽出する。

**核心原則:** 推測で図を作成しない。

**出力:** 解析結果は Phase 2（mermaid-diagram-p2）に引き継がれる。

## Output Format

```
SUMMARY: [コード解析サマリー]
CLAIM: [主要な構造・フロー]
EVIDENCE: [抽出した情報（ファイル:行番号）]
CONFIDENCE: [0.00-1.00]
RESULT:
## 構造
- クラス/モジュール: [...]
- 関係性: [...]

## 制御フロー
- 条件分岐: [...]
- ループ: [...]
- 例外処理: [...]

## インターフェース
- API: [...]
- データフロー: [...]
NEXT_STEP: Phase 2（mermaid-diagram-p2）で図式作成
```
