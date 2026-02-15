---
id: rapid-swarm-p2
name: Rapid Swarm - Phase 2 Dataflow
description: "Rapid Swarm Phase 2: データフロー・状態遷移分析フェーズ。データの流れと状態遷移を迅速に分析する。結果はPhase 3（統合）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: dataflow-analyst-1
    role: Dataflow Analyst 1
    description: "データフロー分析担当1。入力から出力へのデータ変換、ストレージ操作を分析する。"
    enabled: true
  - id: dataflow-analyst-2
    role: Dataflow Analyst 2
    description: "データフロー分析担当2。キャッシュ、非同期処理、イベントフローを分析する。"
    enabled: true
  - id: state-analyst
    role: State Analyst
    description: "状態分析担当。状態遷移、ライフサイクル、永続化を分析する。"
    enabled: true
---

# Rapid Swarm - Phase 2: Dataflow Analysis

## チームミッション

Rapid SwarmのPhase 2（データフロー・状態遷移分析）を担当。Phase 1（rapid-swarm-p1）のインターフェース分析に続いて、内部フローを分析する。

**前提:** Phase 1のインターフェース分析結果を受け取っていること。

**出力:** 分析結果は Phase 3（rapid-swarm-p3）に引き継がれる。

## Output Format

```
SUMMARY: [データフロー分析サマリー]
CLAIM: [主要な発見]
EVIDENCE: [データフロー図、状態遷移図]
CONFIDENCE: [0.00-1.00]
RESULT:
## データフロー
- [フロー1]: [概要]
- [フロー2]: [概要]

## 状態遷移
- [状態1] -> [状態2] -> [状態3]
NEXT_STEP: Phase 3（rapid-swarm-p3）で統合と実行計画
```
