---
name: research-writing
description: 深い研究と執筆ツールの中核スキル。科学的論文を完全な段落で執筆します（箇条書きは使用しません）。research-lookupを使用した要点付きのセクションアウトラインを作成し、その後流れるような散文に変換する2段階プロセスを使用。IMRAD構造、引用（APA/AMA/Vancouver）、図表、報告ガイドライン（CONSORT/STROBE/PRISMA）に対応。研究論文やジャーナル投稿向け。
allowed-tools: [Read, Write, Edit, Bash]
license: MIT license
metadata:
  skill-author: "Mekann"
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research Writing

> **統合スキル:** このスキルは scientific-writing, venue-templates, peer-review, scholar-evaluation を統合したものです。

## 概要

学術論文の執筆を包括的にサポートする統合スキル。研究アイデアの萌芽から投稿準備完了原稿まで、IMRAD構造に基づく論文構成、適切な引用スタイルの適用、査読対応、研究品質評価まで、研究出版に必要な全プロセスを統合的にサポートします。

### 統合されたスキル

| 元スキル | 機能 |
|----------|------|
| scientific-writing | IMRAD構造、2段階執筆プロセス、引用管理 |
| venue-templates | ジャーナル/会議テンプレート、フォーマット要件 |
| peer-review | 査読チェックリスト、CONSORT/STROBE/PRISMA |
| scholar-evaluation | ScholarEvalフレームワーク、品質評価 |

## 使用タイミング

以下の場合に使用:
- 研究論文の執筆と構成
- ジャーナル投稿用原稿の準備
- 査読対応レターの作成
- 研究品質の自己評価
- 報告ガイドラインへの準拠確認
- 引用文献の適切なフォーマット
- 助成金申請書の執筆

## 執筆ワークフロー

### 2段階執筆プロセス

```
執筆フロー:
├── Stage 1: アウトライン作成
│   ├── research-lookupで要点を調査
│   ├── セクションごとの構成案
│   ├── 主要な議論の整理
│   └── 引用のプレースホルダー
│
└── Stage 2: 散文への変換
    ├── アウトラインを段落に展開
    ├── 論理的な流れの構築
    ├── 適切なトランジション
    └── 引用の正確な組み込み
```

### IMRAD構造

```markdown
# タイトル

## Abstract（要旨）
- 背景（1-2文）
- 目的（1文）
- 方法（1-2文）
- 結果（2-3文）
- 結論（1-2文）

## Introduction（序論）
- 研究分野の背景
- 研究ギャップの特定
- 研究目的と仮説

## Methods（方法）
- 研究デザイン
- 対象/データ
- 測定方法
- 統計分析

## Results（結果）
- 対象の特性
- 主要結果
- 副次結果
- 感度分析

## Discussion（考察）
- 主要発見の要約
- 既存研究との比較
- 研究の限界
- 臨床/科学的意義
- 今後の研究方向

## References（文献）
```

## ワークフロー

### ステップ1: ジャーナル選択と要件確認

```python
def select_journal(manuscript_type, field, impact_target):
    """
    原稿に適したジャーナルを選択

    Args:
        manuscript_type: "original_research", "review", "case_report"
        field: 研究分野
        impact_target: 目標インパクトファクター

    Returns:
        推奨ジャーナルリストと要件
    """
    journals = {
        "Nature": {
            "impact_factor": 64.8,
            "format": "Nature format",
            "word_limit": {"article": 5000, "letter": 2500},
            "figures": 4,
            "references": 50
        },
        "Science": {
            "impact_factor": 56.9,
            "format": "Science format",
            "word_limit": {"research_article": 4500, "report": 2500},
            "figures": 6,
            "references": 40
        },
        "Cell": {
            "impact_factor": 64.5,
            "format": "Cell format",
            "word_limit": {"article": 7000},
            "figures": 8,
            "references": 100
        },
        "NEJM": {
            "impact_factor": 158.5,
            "format": "NEJM format",
            "word_limit": {"original_article": 4500},
            "figures": 5,
            "references": 50
        }
    }

    return journals
```

### ステップ2: アウトライン作成

```python
def create_outline(research_data, literature_review):
    """
    research-lookupを使用したアウトライン作成
    """

    outline = {
        "title": generate_title(research_data["main_finding"]),
        "abstract": {
            "background": "研究背景の要点",
            "objective": "研究目的",
            "methods": "方法の概要",
            "results": "主要結果",
            "conclusion": "結論と意義"
        },
        "introduction": [
            "分野の現状と重要性",
            "既存研究の概観",
            "研究ギャップの特定",
            "本研究の目的と仮説"
        ],
        "methods": [
            "研究デザイン",
            "対象/サンプル",
            "データ収集方法",
            "変数の定義",
            "統計分析方法"
        ],
        "results": [
            "対象の特性（Table 1）",
            "主要アウトカム",
            "副次アウトカム",
            "感度分析/サブグループ解析"
        ],
        "discussion": [
            "主要発見の要約",
            "既存文献との比較",
            "研究の強み",
            "研究の限界",
            "臨床/科学的意義",
            "今後の展望"
        ]
    }

    return outline
```

### ステップ3: 散文への変換

```python
def convert_to_prose(outline_section, style="academic"):
    """
    アウトラインを流れるような散文に変換

    重要: 箇条書きは使用せず、完全な段落で執筆
    """

    prose = {
        "introduction": """
        糖尿病は世界的に増加している慢性疾患であり、その合併症は患者の生活の質に
        深刻な影響を与えている。近年、早期介入の重要性が強調されているが、最適な
        介入タイミングについては依然として議論がある。本研究では、新規診断例を
        対象とした早期集中的介入の効果を検証することを目的とした。
        """,

        "methods": """
        本研究は、多施設共同前向きコホート研究として設計された。2020年1月から
        2023年12月までに、5つの医療機関で新規に2型糖尿病と診断された成人患者
        500例を登録した。介入群には集中的な生活習慣指導と薬物療法を組み合わせた
        包括的プログラムを提供し、対照群には通常ケアを行った。主要評価項目は
        12ヶ月後のHbA1c値とした。
        """,

        "results": """
        解析対象となった478例（介入群239例、対照群239例）のベースライン特性に
        有意差は認められなかった。12ヶ月後のHbA1c値は、介入群で平均1.2%
        （95%信頼区間: 0.9-1.5%）低下し、対照群の0.4%（同: 0.2-0.6%）と比較して
        有意に大きな改善を示した（p<0.001）。
        """,

        "discussion": """
        本研究は、新規診断糖尿病患者に対する早期集中的介入の有効性を実世界設定で
        検証した点で意義がある。介入群で認められたHbA1cの有意な改善は、過去の
        ランダム化比較試験の結果と一貫しており、臨床診療における早期介入の重要性
        を支持するものである。一方で、単一地域での実施である点や、追跡期間が
        限られている点は本研究の限界である。
        """
    }

    return prose
```

### ステップ4: 引用スタイルの適用

```python
def format_citation(reference, style="apa"):
    """
    各引用スタイルへの変換
    """

    styles = {
        "apa": f"{reference['authors']} ({reference['year']}). {reference['title']}. "
               f"{reference['journal']}, {reference['volume']}({reference['issue']}), "
               f"{reference['pages']}. https://doi.org/{reference['doi']}",

        "ama": f"{reference['authors']}. {reference['title']}. {reference['journal']}. "
               f"{reference['year']};{reference['volume']}({reference['issue']}):"
               f"{reference['pages']}. doi:{reference['doi']}",

        "vancouver": f"{reference['authors']}. {reference['title']}. "
                     f"{reference['journal']}. {reference['year']};"
                     f"{reference['volume']}({reference['issue']}):{reference['pages']}.",

        "nature": f"{reference['authors']} {reference['title']} "
                  f"{reference['journal']} {reference['volume']}, {reference['pages']} "
                  f"({reference['year']})."
    }

    return styles.get(style, styles["apa"])
```

### ステップ5: 査読準備

```python
def prepare_peer_review_checklist(study_type):
    """
    報告ガイドラインに基づくチェックリスト
    """

    checklists = {
        "rct": {
            "guideline": "CONSORT 2010",
            "items": [
                "タイトルと要旨でランダム化比較試験と明記",
                "背景と目的の科学的根拠",
                "参加基準と除外基準の明記",
                "ランダム化の詳細",
                "ブラインド化の方法",
                "主要/副次評価項目の定義",
                "サンプルサイズの根拠",
                "ランダム化割り付けの順序",
                "意向治療解析の実施",
                "ハームの報告"
            ]
        },
        "observational": {
            "guideline": "STROBE",
            "items": [
                "研究デザインの明記",
                "設定の記述",
                "参加者の選択",
                "変数の定義",
                "データソースの記述",
                "バイアスへの対処",
                "サンプルサイズの根拠",
                "量的変数の取り扱い",
                "統計手法の記述",
                "記述的データの提示"
            ]
        },
        "systematic_review": {
            "guideline": "PRISMA 2020",
            "items": [
                "検索戦略の完全な記述",
                "データベースの特定",
                "選択基準の明記",
                "データ抽出プロセス",
                "リスクバイアス評価",
                "追加分析の記述",
                "PRISMAフロー図",
                "結果の統合方法",
                "出版バイアスの評価",
                "限界の議論"
            ]
        }
    }

    return checklists.get(study_type, {})
```

## 報告ガイドライン

### CONSORT（ランダム化比較試験）

| セクション | 項目 | 内容 |
|------------|------|------|
| Title | 1a | ランダム化比較試験と明記 |
| Abstract | 2 | 構造化要旨 |
| Introduction | 4 | 目的と仮説 |
| Methods | 7a, 7b | ランダム化の詳細 |
| Results | 13a, 13b | 参加者フロー |
| Discussion | 20 | 限界 |

### STROBE（観察研究）

| セクション | 項目 | 内容 |
|------------|------|------|
| Title | 1 | 研究デザインの明記 |
| Abstract | 2 | 構造化要旨 |
| Introduction | 3 | 科学的背景 |
| Methods | 5-12 | 設定、変数、バイアス |
| Results | 13-16 | 参加者、記述、主要結果 |
| Discussion | 17-21 | 主要結果、限界、解釈 |

### PRISMA（系統的レビュー）

| セクション | 項目 | 内容 |
|------------|------|------|
| Title | 1 | 系統的レビューと明記 |
| Abstract | 2 | 構造化要旨 |
| Introduction | 3-4 | 理論的根拠、目的 |
| Methods | 5-16 | プロトコル、検索、選択 |
| Results | 17-22 | 検索結果、研究特性 |
| Discussion | 23-25 | エビデンスの要約、限界 |

## ScholarEval評価フレームワーク

```python
def evaluate_manuscript(manuscript):
    """
    ScholarEvalフレームワークによる原稿評価
    """

    evaluation = {
        "problem_formulation": {
            "clarity": score_0_10,        # 問題の明確性
            "significance": score_0_10,   # 重要性
            "novelty": score_0_10,        # 新規性
        },
        "methodology": {
            "appropriateness": score_0_10, # 手法の適切性
            "rigor": score_0_10,           # 厳密性
            "reproducibility": score_0_10, # 再現性
        },
        "analysis": {
            "correctness": score_0_10,     # 正確性
            "completeness": score_0_10,    # 完全性
            "interpretation": score_0_10,  # 解釈の妥当性
        },
        "writing": {
            "clarity": score_0_10,         # 明確さ
            "organization": score_0_10,    # 構成
            "citations": score_0_10,       # 引用の適切性
        }
    }

    # 総合スコア計算
    total_score = sum([
        sum(evaluation["problem_formulation"].values()),
        sum(evaluation["methodology"].values()),
        sum(evaluation["analysis"].values()),
        sum(evaluation["writing"].values())
    ]) / 12  # 平均

    return {
        "evaluation": evaluation,
        "total_score": total_score,
        "recommendation": get_recommendation(total_score)
    }
```

## ジャーナルテンプレート

### Nature

```latex
\documentclass{nature}

\title{Title of the manuscript}
\author{Author One\textsuperscript{1,*}, Author Two\textsuperscript{1} \& Author Three\textsuperscript{2}}
\affiliation{
  \textsuperscript{1}Department, Institution, City, Country \\
  \textsuperscript{2}Department, Institution, City, Country \\
  \textsuperscript{*}Corresponding author
}

\begin{document}

\maketitle

\begin{abstract}
Abstract text here (150 words maximum).
\end{abstract}

% Main text (2,500-5,000 words)

% Methods section (online only)

% References (maximum 50)

\end{document}
```

### Science

```latex
\documentclass{science}

\title{Title}
\author{Author One, Author Two, Author Three*

One paragraph author affiliation

*Corresponding author. Email: author@institution.edu

\begin{abstract}
Abstract (125 words maximum)
\end{abstract}

% Main text

% References (maximum 40)

\end{document}
```

## 他のスキルとの統合

### research-literature
文献検索結果を引用として組み込み。

### research-statistics
統計結果をResultsセクションに正確に報告。

### research-visualization
図表を作成し、適切なキャプションを付与。

### research-critical
原稿の批判的レビューを実施。

## スクリプト

### manuscript_builder.py
```bash
python scripts/manuscript_builder.py \
    --data results.csv \
    --template nature \
    --output manuscript/
```

### review_generator.py
```bash
python scripts/review_generator.py \
    --manuscript draft.tex \
    --checklist consort \
    --output review_comments.md
```

### evaluation_scorer.py
```bash
python scripts/evaluation_scorer.py \
    --manuscript draft.pdf \
    --framework scholar-eval \
    --output evaluation.json
```

## トラブルシューティング

### ライター's ブロック
**解決策:** 2段階プロセスを厳守
1. まずアウトラインのみ作成（詳細度は低くて良い）
2. 各セクションを少しずつ散文化

### 引用の不一致
**解決策:** BibTeXファイルとの一元管理
```python
# 全ての引用をBibTeXから自動生成
from bibtexparser import load

with open('references.bib') as f:
    bib = load(f)
    # テキスト内の引用キーを検証
```

### 文字数超過
**解決策:** セクションごとの目標設定
```python
word_targets = {
    "abstract": 250,
    "introduction": 800,
    "methods": 1000,
    "results": 1200,
    "discussion": 1000
}
```

## ベストプラクティス

1. **2段階執筆**
   - アウトライン -> 散文の順序を守る
   - 箇条書きは使用しない

2. **明確な構造**
   - IMRAD構造に従う
   - 各パラグラフに明確な主題

3. **適切な引用**
   - 主張には必ず引用を付ける
   - 最新の文献を優先

4. **報告ガイドライン準拠**
   - 研究タイプに応じたチェックリストを使用
   - 全項目を満たしているか確認

5. **反復的な改善**
   - 複数のドラフトを作成
   - フィードバックを積極的に取り入れる

## リファレンス

### imrad_structure.md
IMRAD構造の詳細、各セクションの書き方ガイド。

### citation_styles.md
APA, AMA, Vancouver, Nature等の完全なスタイルガイド。

### reporting_guidelines.md
CONSORT, STROBE, PRISMA, ARRIVE等の完全なチェックリスト。

### writing_principles.md
科学的文章作成の原則、明確さ、簡潔さ。

### venue_styles.md
各ジャーナルの詳細な投稿要件。

### peer_review_checklist.md
査読プロセスの準備と対応ガイド。
