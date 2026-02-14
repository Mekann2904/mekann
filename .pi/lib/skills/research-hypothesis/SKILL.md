---
name: research-hypothesis
description: 体系的な仮説生成・検証システム。科学的観察からの仮説定式化、LLM駆動の自動仮説テスト（Hypogenic）、創造的研究アイデア生成を統合。科学的方法に基づく構造化された仮説構築、予測の生成、検証実験の設計をサポート。観察から実験可能な仮説への変換プロセスを全面的に支援。
allowed-tools: Read Write Edit Bash
license: MIT
metadata:
  skill-author: "Mekann"
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research Hypothesis

> **統合スキル:** このスキルは hypothesis-generation, hypogenic, scientific-brainstorming を統合したものです。

## 概要

科学的仮説の生成、検証、洗練を包括的にサポートする統合スキル。観察データからの構造化された仮説定式化、LLMを活用した自動仮説テスト、創造的な研究アイデア探索を統合的に提供します。科学的方法に基づき、検証可能な予測と実験デザインの提案まで、仮説駆動型研究の全プロセスを支援します。

### 統合されたスキル

| 元スキル | 機能 |
|----------|------|
| hypothesis-generation | 構造化仮説定式化、予測生成、実験デザイン |
| hypogenic | LLM駆動の自動仮説テスト、データパターン探索 |
| scientific-brainstorming | 創造的研究アイデア、学際的つながり、研究ギャップ発見 |

## 使用タイミング

以下の場合に使用:
- 観察データからの仮説生成
- 研究アイデアの構造化
- 自動化された仮説検証
- 創造的なブレインストーミングセッション
- 研究ギャップの特定
- 予測と実験デザインの作成
- 既存仮説の精緻化

## 仮説生成アプローチ

```
仮説生成フロー:
├── 観察ベース（hypothesis-generation）
│   ├── 現象の記述
│   ├── パターンの特定
│   ├── 仮説の定式化
│   ├── 予測の生成
│   └── 実験の設計
│
├── データ駆動（hypogenic）
│   ├── データの探索
│   ├── パターンの自動検出
│   ├── LLMによる仮説生成
│   ├── 統計的検証
│   └── 仮説の精緻化
│
└── 創造的（scientific-brainstorming）
    ├── 自由連想
    ├── 学際的つながり
    ├── 前提の挑戦
    ├── 研究ギャップ探索
    └── 新規性の評価
```

## ワークフロー

### ステップ1: 観察から仮説へ

```python
def formulate_hypothesis(observations):
    """
    観察から構造化された仮説を定式化

    Args:
        observations: 観察データのリスト

    Returns:
        構造化された仮説
    """

    # 1. 現象の記述
    phenomenon = describe_phenomenon(observations)

    # 2. パターンの特定
    patterns = identify_patterns(observations)

    # 3. 仮説の定式化（If-Then形式）
    hypothesis = {
        "statement": f"If {independent_variable} affects {dependent_variable}, "
                    f"then {expected_outcome}.",
        "mechanism": propose_mechanism(patterns),
        "testability": assess_testability(expected_outcome),
        "falsifiability": define_falsification_criteria(expected_outcome)
    }

    # 4. 予測の生成
    predictions = generate_predictions(hypothesis)

    # 5. 実験デザイン
    experiment = design_experiment(hypothesis, predictions)

    return {
        "hypothesis": hypothesis,
        "predictions": predictions,
        "experiment": experiment
    }
```

### ステップ2: 予測の生成

```python
def generate_predictions(hypothesis):
    """
    仮説から検証可能な予測を生成
    """

    predictions = {
        "primary": {
            "statement": "主要予測: 条件Aでは条件Bよりも高い値が観察される",
            "operationalization": "測定方法: XスケールでYを測定",
            "expected_effect_size": "期待される効果量: Cohen's d > 0.5",
            "statistical_test": "統計検定: 独立サンプルt検定"
        },
        "secondary": [
            {
                "statement": "副次予測1: 用量反応関係が観察される",
                "operationalization": "...",
                "expected_direction": "正の相関"
            },
            {
                "statement": "副次予測2: メディエーターを介した効果",
                "operationalization": "...",
                "expected_mechanism": "MがAとBの関係を媒介"
            }
        ],
        "falsification": {
            "condition": "予測が支持されない条件",
            "interpretation": "仮説が誤りである可能性"
        }
    }

    return predictions
```

### ステップ3: 自動仮説テスト（Hypogenic）

```python
def automated_hypothesis_testing(data, research_question):
    """
    HypogenicアプローチによるLLM駆動の仮説テスト

    Args:
        data: 表形式のデータセット
        research_question: 研究質問

    Returns:
        生成された仮説と検証結果
    """

    # 1. データの前処理
    processed_data = preprocess_data(data)

    # 2. LLMによる仮説生成
    generated_hypotheses = llm_generate_hypotheses(
        data=processed_data,
        question=research_question,
        num_hypotheses=10
    )

    # 3. 各仮説の統計的検証
    results = []
    for hypothesis in generated_hypotheses:
        # 仮説を検証可能な形式に変換
        testable = convert_to_testable(hypothesis)

        # 統計検定の実行
        statistical_result = run_statistical_test(
            data=processed_data,
            test_spec=testable
        )

        # 結果の評価
        evaluation = evaluate_result(
            hypothesis=hypothesis,
            result=statistical_result
        )

        results.append({
            "hypothesis": hypothesis,
            "test": testable,
            "result": statistical_result,
            "evaluation": evaluation,
            "supported": evaluation["p_value"] < 0.05
        })

    # 4. 結果の統合
    summary = synthesize_findings(results)

    return {
        "hypotheses": results,
        "summary": summary,
        "recommendations": generate_recommendations(summary)
    }
```

### ステップ4: 創造的ブレインストーミング

```python
def creative_brainstorming(domain, constraints=None):
    """
    創造的な研究アイデア生成

    Args:
        domain: 研究分野
        constraints: 制約条件

    Returns:
        革新的な研究アイデア
    """

    ideas = []

    # 1. 学際的つながりの探索
    interdisciplinary = explore_interdisciplinary_connections(
        domain,
        related_fields=["biology", "physics", "computer_science", "psychology"]
    )
    ideas.extend(interdisciplinary)

    # 2. 前提の挑戦
    challenged_assumptions = challenge_assumptions(
        domain,
        common_assumptions=get_paradigm_assumptions(domain)
    )
    ideas.extend(challenged_assumptions)

    # 3. 研究ギャップの特定
    gaps = identify_research_gaps(
        domain,
        literature_review=conduct_literature_scan(domain)
    )
    ideas.extend(gaps)

    # 4. アイデアの評価
    evaluated_ideas = []
    for idea in ideas:
        evaluation = evaluate_idea(
            idea=idea,
            criteria={
                "novelty": "新規性",
                "feasibility": "実現可能性",
                "impact": "インパクト",
                "testability": "検証可能性"
            }
        )
        evaluated_ideas.append({
            "idea": idea,
            "scores": evaluation,
            "priority": calculate_priority(evaluation)
        })

    # 優先順位でソート
    evaluated_ideas.sort(key=lambda x: x["priority"], reverse=True)

    return evaluated_ideas
```

### ステップ5: 実験デザイン

```python
def design_experiment(hypothesis, predictions):
    """
    仮説を検証するための実験デザイン
    """

    design = {
        "type": select_design_type(hypothesis),  # "experimental", "observational", "quasi-experimental"

        "participants": {
            "population": "対象集団の定義",
            "sample_size": calculate_sample_size(
                effect_size=predictions["expected_effect_size"],
                alpha=0.05,
                power=0.80
            ),
            "inclusion_criteria": ["基準1", "基準2"],
            "exclusion_criteria": ["除外基準1"]
        },

        "variables": {
            "independent": {
                "name": "独立変数名",
                "levels": ["条件A", "条件B"],
                "manipulation": "操作方法"
            },
            "dependent": {
                "name": "従属変数名",
                "measurement": "測定方法",
                "unit": "単位"
            },
            "controls": ["統制変数1", "統制変数2"]
        },

        "procedure": {
            "randomization": "ランダム化方法",
            "blinding": "ブラインド化（必要に応じて）",
            "sequence": ["ステップ1", "ステップ2", "ステップ3"]
        },

        "analysis": {
            "primary_test": "主要統計検定",
            "secondary_tests": ["副次検定1", "副次検定2"],
            "software": "R / Python / SPSS"
        }
    }

    return design
```

## 仮説品質評価

```python
def evaluate_hypothesis_quality(hypothesis):
    """
    仮説の品質を多角的に評価
    """

    criteria = {
        "clarity": {
            "score": 0-10,
            "aspects": [
                "変数が明確に定義されているか",
                "関係性が具体的か",
                "あいまいさがないか"
            ]
        },
        "testability": {
            "score": 0-10,
            "aspects": [
                "検証可能な予測が生成できるか",
                "測定可能な変数か",
                "反証可能か"
            ]
        },
        "theoretical_grounding": {
            "score": 0-10,
            "aspects": [
                "既存理論と整合しているか",
                "理論的根拠があるか",
                "新規性があるか"
            ]
        },
        "feasibility": {
            "score": 0-10,
            "aspects": [
                "実験が実施可能か",
                "リソースが利用可能か",
                "倫理的に問題ないか"
            ]
        },
        "significance": {
            "score": 0-10,
            "aspects": [
                "科学的意義があるか",
                "実践的意義があるか",
                "影響範囲が大きいか"
            ]
        }
    }

    # 総合スコア
    total = sum(c["score"] for c in criteria.values()) / len(criteria)

    return {
        "criteria": criteria,
        "total_score": total,
        "recommendation": get_improvement_recommendations(criteria)
    }
```

## スクリプト

### generate_hypotheses.py
```bash
python scripts/generate_hypotheses.py \
    --observations observations.json \
    --output hypotheses.json \
    --num-hypotheses 5
```

### test_hypotheses.py
```bash
python scripts/test_hypotheses.py \
    --data dataset.csv \
    --hypotheses hypotheses.json \
    --output results/
```

### brainstorm.py
```bash
python scripts/brainstorm.py \
    --domain "machine learning healthcare" \
    --constraints "feasible_in_1_year" \
    --output ideas.json \
    --num-ideas 20
```

## 他のスキルとの統合

### research-literature
文献レビューから研究ギャップを特定し、仮説生成の入力とする。

### research-data-analysis
EDAで発見したパターンから仮説を生成。

### research-statistics
生成した仮説を統計的に検証。

### research-critical
仮説の質を批判的に評価。

### research-writing
仮説を論文のIntroduction/Hypothesisセクションに統合。

## 使用例

### 観察から仮説へ

```python
# 観察データ
observations = [
    "患者群Aは治療Xに良好に反応した",
    "患者群Bは治療Xに反応しなかった",
    "群Aは生物学的マーカーYを高発現していた",
    "群BはマーカーYを低発現だった"
]

# 仮説生成
result = formulate_hypothesis(observations)

print(f"仮説: {result['hypothesis']['statement']}")
# "マーカーYの発現レベルが治療Xへの反応性を予測する"

print(f"予測: {result['predictions']['primary']['statement']}")
# "マーカーY高発現患者では治療Xの効果が高い"

print(f"実験: {result['experiment']['type']}")
# "前向きコホート研究"
```

### 自動仮説テスト

```python
import pandas as pd

# データ読み込み
data = pd.read_csv("clinical_data.csv")

# 研究質問
question = "どの要因が治療転帰を予測するか？"

# 自動テスト実行
results = automated_hypothesis_testing(data, question)

# 結果の確認
for r in results["hypotheses"][:3]:
    print(f"仮説: {r['hypothesis']}")
    print(f"支持: {r['supported']}")
    print(f"p値: {r['result']['p_value']:.4f}")
    print()
```

### 創造的ブレインストーミング

```python
# ブレインストーミングセッション
ideas = creative_brainstorming(
    domain="precision_medicine",
    constraints=["feasible_with_current_technology", "ethically_acceptable"]
)

# トップアイデアの確認
for idea in ideas[:5]:
    print(f"アイデア: {idea['idea']}")
    print(f"新規性: {idea['scores']['novelty']}/10")
    print(f"実現可能性: {idea['scores']['feasibility']}/10")
    print(f"優先度: {idea['priority']:.2f}")
    print()
```

## トラブルシューティング

### 仮説が検証不可能
**解決策:** 操作的定義の明確化
```python
# 悪い例: "ストレスは健康に悪影響を与える"
# 良い例: "知覚ストレス尺度(PSS)スコアが10点上昇すると、
#         血圧が5mmHg上昇する"
```

### 多重仮説問題
**解決策:** 事前登録と多重比較補正
```python
# Bonferroni補正
alpha_corrected = 0.05 / num_hypotheses

# FDR制御（Benjamini-Hochberg）
from statsmodels.stats.multitest import multipletests
rejected, adjusted_p = multipletests(p_values, method='fdr_bh')
```

### 創造性の欠如
**解決策:** 異なる視点からのアプローチ
```python
# SCAMPERテクニック
techniques = [
    "Substitute: 何を置き換えられるか",
    "Combine: 何と組み合わせられるか",
    "Adapt: 何を適応できるか",
    "Modify: 何を変更できるか",
    "Put to other uses: 他の用途はあるか",
    "Eliminate: 何を削除できるか",
    "Reverse: 何を逆転できるか"
]
```

## ベストプラクティス

1. **構造化された仮説**
   - If-Then形式を使用
   - 変数を明確に定義
   - 反証可能性を確保

2. **複数の予測**
   - 主要予測と副次予測を設定
   - 反例となる条件を明記

3. **段階的な検証**
   - 探索的分析から確認的分析へ
   - 外部検証を計画

4. **創造性と厳密性のバランス**
   - 自由な発想から厳密な検証へ
   - パイプライン化して再現性を確保

5. **事前登録**
   - 仮説を事前に登録
   - p-hackingを防止

## リファレンス

### hypothesis_formulation.md
科学的方法に基づく仮説定式化の詳細ガイド。

### automated_testing.md
Hypogenicワークフローの詳細設定と実行方法。

### brainstorming_techniques.md
創造的思考技法、グループブレインストーミング手法。

### experimental_design.md
仮説検証のための実験デザイン原則。

### quality_criteria.md
良い仮説の評価基準、改善のためのチェックリスト。
