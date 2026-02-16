---
id: logical-analysis-team
name: Logical Analysis Team
description: 論理的テキスト分析専門チーム。学術論文、技術文書、仕様書、契約書など幅広いテキストを対象に、構造・概念・論証の3軸で体系的に分析。論理的整合性、概念的明確性、論証の妥当性を評価し、改善提案を提供。
enabled: disabled
strategy: parallel
skills:
  - logical-analysis
members:
  - id: structure-analyst
    role: Structure Analyst
    description: テキストの全体構造を分析。章・節構成、階層関係、依存関係、論理の流れをマッピングし、構造ツリーと依存グラフを作成。
    enabled: true
  - id: concept-analyst
    role: Concept Analyst
    description: 主要概念の定義と階層構造を分析。明示的・暗黙的定義を抽出し、概念階層と概念間関係（汎化・構成・依存）を構築。
    enabled: true
  - id: argument-evaluator
    role: Argument Evaluator
    description: 論証の妥当性を評価。前提・推論・結論を特定し、演繹・帰納・類推などの推論タイプを分析。反論可能性と論証の強さを評価。
    enabled: true
  - id: synthesis-coordinator
    role: Synthesis Coordinator
    description: 3つの分析結果を統合。整合性を確認し、核心的主張、論理的構成、限界と課題を整理。改善提案を作成。
    enabled: true
---

# Logical Analysis Team

論理的テキスト分析専門チーム。あらゆる種類のテキストを**構造**、**概念**、**論証**の3軸から分析し、一貫した解釈と改善提案を提供する。

---

## 分析フレームワーク

```
        ┌─────────────────────────────────────┐
        │           入力テキスト               │
        └──────────────────┬──────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │  構造分析  │   │  概念分析  │   │  論証評価  │
    │   (p1)    │   │   (p2)    │   │   (p3)    │
    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
          │               │               │
          └───────────────┼───────────────┘
                          │
                          ▼
               ┌─────────────────────┐
               │      統合 (p4)      │
               └─────────────────────┘
```

---

## メンバー詳細

メンバーごとの詳細な指示は以下のファイルを参照：

| メンバー | ファイル | 主な責任 |
|----------|----------|----------|
| **Structure Analyst** | [p1.md](p1.md) | 構造ツリー、依存関係、論理フロー |
| **Concept Analyst** | [p2.md](p2.md) | 定義抽出、概念階層、関係分析 |
| **Argument Evaluator** | [p3.md](p3.md) | 論証構造、妥当性評価、誤謬検出 |
| **Synthesis Coordinator** | [p4.md](p4.md) | 統合、矛盾特定、改善提案 |

---

## 適用範囲

| 文書タイプ | 主な分析焦点 |
|-----------|-------------|
| **学術論文** | 論証の厳密性、概念の定義、研究課題の明確性 |
| **技術文書・仕様書** | 要件の完全性、仕様間の整合性、テスト可能性 |
| **契約書・法的文書** | 条項間の整合性、定義の一貫性、解釈の一意性 |
| **ビジネス文書・提案書** | 目的の明確性、根拠の妥当性、実現可能性 |
| **政策文書** | 政策目標の明確性、因果関係の妥当性 |

---

## 分析の原則

```
1. 構造を尊重する    - テキストの構成は意図的
2. 文脈で解釈する    - 語句の意味は文脈で決まる
3. 暗黙を明示化      - 隠れた前提を特定
4. 一貫性を検証      - 矛盾を検出
5. 曖昧性を特定      - 複数解釈を明確化
```

---

## 使用方法

```bash
# チームを有効化
pi team enable logical-analysis-team

# 分析を実行
pi team run logical-analysis-team "このAPI仕様書を論理的に分析してください"
pi team run logical-analysis-team "この契約書の条項間の整合性を分析してください"
pi team run logical-analysis-team "この論文の論証構造を評価してください"
```

---

## 共有スキル

チーム全体で `logical-analysis` スキルを共有。詳細な分析フレームワークとテンプレートは `.pi/skills/logical-analysis/SKILL.md` を参照。
