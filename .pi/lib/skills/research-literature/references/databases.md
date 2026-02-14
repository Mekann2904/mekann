# 文献調査リファレンス

## 学術データベース一覧

### 生物医学系

| データベース | 特徴 | URL |
|--------------|------|-----|
| PubMed | MEDLINE収載、生物医学中心 | https://pubmed.ncbi.nlm.nih.gov/ |
| Embase | 欧州医薬誌、薬学に強い | https://www.embase.com/ |
| Cochrane Library | システマティックレビュー | https://www.cochranelibrary.com/ |

### 物理・数学・CS

| データベース | 特徴 | URL |
|--------------|------|-----|
| arXiv | プレプリント、物理・CS・数学 | https://arxiv.org/ |
| ACM Digital Library | コンピュータ科学 | https://dl.acm.org/ |
| IEEE Xplore | 電気電子工学 | https://ieeexplore.ieee.org/ |

### 総合系

| データベース | 特徴 | URL |
|--------------|------|-----|
| Google Scholar | 総合検索、被引用数 | https://scholar.google.com/ |
| Semantic Scholar | AI搭載、関連論文推薦 | https://www.semanticscholar.org/ |
| Web of Science | 引用索引、インパクトファクター | https://www.webofscience.com/ |
| Scopus | 大規模引用データベース | https://www.scopus.com/ |

## 検索戦略

### 1. キーワード設計

```
[PICOT フレームワーク]
P (Population): 対象集団
I (Intervention): 介入
C (Comparison): 比較対照
O (Outcome): アウトカム
T (Time): 時間軸
```

### 2. ブール演算子

| 演算子 | 効果 | 例 |
|--------|------|-----|
| AND | 両方を含む | "machine learning" AND healthcare |
| OR | いずれかを含む | "deep learning" OR "neural network" |
| NOT | 除外 | cancer NOT leukemia |
| "" | 完全一致 | "randomized controlled trial" |

### 3. フィルタ活用

- **出版年**: 直近5年など
- **論文種別**: 原著、レビュー、メタ分析
- **言語**: 英語のみなど
- **アクセス**: オープンアクセス

## 引用管理

### BibTeX形式

```bibtex
@article{author2024title,
    author = {Last, First and Other, Author},
    title = {Title of the Article},
    journal = {Journal Name},
    year = {2024},
    volume = {1},
    number = {1},
    pages = {1--10},
    doi = {10.xxxx/xxxxx}
}
```

### 引用スタイル

| スタイル | 分野 | 特徴 |
|----------|------|------|
| APA | 心理学、社会科学 | 著者-年形式 |
| MLA | 人文学 | 著者-ページ形式 |
| Vancouver | 医学 | 番号形式 |
| IEEE | 工学 | 番号形式 |
| Nature | 自然科学 | 番号形式（上付き） |

## 系統的文献レビュー

### PRISMAフロー

```
同定 → スクリーニング → 適格性判定 → 包含
  │          │              │          │
  ↓          ↓              ↓          ↓
検索結果   タイトル・    全文確認   最終
(n件)     抽象レビュー              (N件)
```

### 品質評価ツール

| 研究デザイン | 評価ツール |
|--------------|------------|
| RCT | Cochrane Risk of Bias |
| 観察研究 | Newcastle-Ottawa Scale |
| 症例対照研究 | Newcastle-Ottawa Scale |
| 診断精度研究 | QUADAS-2 |
| 質的研究 | CASPチェックリスト |

## AI活用

### 文献要約

- SciSpace (Typeset.io)
- Elicit
- Consensus

### 関連論文発見

- Connected Papers
- ResearchRabbit
- Litmaps

### 引用分析

- Semantic Scholar
- OpenAlex
- Dimensions
