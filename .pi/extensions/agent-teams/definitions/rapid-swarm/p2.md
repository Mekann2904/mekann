---
id: rapid-swarm-p2
name: Rapid Swarm - Phase 2 Dataflow
description: "Rapid Swarm Phase 2: データフロー・状態遷移分析フェーズ。データの流れと状態遷移を迅速に分析する。結果はPhase 3（統合）に引き継ぐ。"
enabled: enabled
strategy: parallel
triggers:
  - Phase 1完了後のインターフェース分析結果
skip_conditions:
  - Phase 1の分析結果未受領（Phase 1に戻る）
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

**核心原則:** 内部動作とビジネスロジックから分析し、簡潔で実行可能な出力を返す。

**鉄の掟:**
```
単一視点に依存しない
前提条件と境界を明確に示す
```

**前提:** Phase 1のインターフェース分析結果を受け取っていること。

**出力:** 分析結果は Phase 3（rapid-swarm-p3）に引き継がれる。

## When to Use

Phase 1完了後、必ず実施:
- 内部データフローと状態遷移の分析
- ビジネスロジックと技術的制約の評価

**スキップしてはならない:**
- 「この分析は明らかだから省略」→ 自明は主観

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

## 警告信号 - プロセスの遵守を促す

以下のような考えが浮かんだら、それはSTOPのサイン:
- 「この視点だけで十分だろう」
- 「前提条件を確認する時間はない」
- Phase 1の結果を確認していない

**これらすべては: STOP。Phase 2を完了せよ。**

## 人間のパートナーの「やり方が間違っている」シグナル

**以下の方向転換に注意:**
- 「もう一方の視点はどうか？」 - 片方の分析に偏っている
- 「前提条件は確認したか？」 - 前提が不明確

**これらを見たら:** STOP。Phase 2を完了せよ。

## よくある言い訳

| 言い訳 | 現実 |
|--------|------|
| 「この視点だけで十分」 | 単一視点は盲点を生む。複数視点が本質を捉える。 |
| 「前提確認の時間がない」 | 前提の欠如は後の大きな手戻りを生む。 |
