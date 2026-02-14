---
name: research-literature
description: 統合文献検索・管理システム。PubMed、arXiv、bioRxiv、Semantic Scholarなど複数の学術データベースの検索、BibTeX引用管理、Perplexity AIによる最新研究情報の取得、系統的文献レビューの実施を統合。APA、Nature、Vancouverなど複数の引用スタイルに対応し、検証済み引用を含むプロフェッショナルな文書を生成する。
allowed-tools: Read Write Edit Bash
license: MIT
metadata:
  skill-author: "Mekann"
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research Literature

> **統合スキル:** このスキルは literature-review, citation-management, research-lookup, perplexity-search を統合したものです。

## 概要

研究文献の検索、管理、統合を一元的に行う包括的なスキル。複数の学術データベースの検索、正確な引用情報の抽出と検証、BibTeX形式での管理、AIを活用した最新研究情報の取得、体系的文献レビューの実施を統合的にサポートします。

### 統合されたスキル

| 元スキル | 機能 |
|----------|------|
| literature-review | 系統的文献レビュー、マルチデータベース検索、レビュー生成 |
| citation-management | BibTeX生成、メタデータ抽出、DOI/PMID変換 |
| research-lookup | Perplexity Sonar Pro Search統合、最新研究情報取得 |
| perplexity-search | AI搭載Web検索、リアルタイム情報取得 |

## 使用タイミング

以下の場合に使用:
- 系統的文献レビューまたはスコーピングレビューの実施
- 複数データベースにわたる包括的な文献検索
- BibTeXファイルの作成・管理・検証
- 特定論文の検索とメタデータ抽出
- 最新の研究動向や発表の確認
- 引用の正確性検証とフォーマット統一
- 研究ギャップと将来の方向性の特定
- メタアナリシスのための文献収集

## ワークフロー

### ステップ1: 検索戦略の策定

```
検索計画フロー:
├── 研究課題の定義（PICO/SPIDER）
│   ├── Population/Problem
│   ├── Intervention/Interest
│   ├── Comparison/Control
│   └── Outcome
├── データベース選択
│   ├── 生物医学: PubMed, MEDLINE
│   ├── 物理学/数学/CS: arXiv
│   ├── 生物学: bioRxiv, medRxiv
│   ├── 包括的: Semantic Scholar, Google Scholar
│   └── AI/Web: Perplexity Search
└── 検索クエリ構築
    ├── キーワード抽出
    ├── ブール演算子結合
    └── フィルタ設定
```

### ステップ2: マルチデータベース検索

#### PubMed/NCBI検索

```python
from pymed import PubMed

pubmed = PubMed(tool="research-tool", email="researcher@example.com")

# PICOベースの検索
results = pubmed.query("""
    (CRISPR[Title/Abstract]) AND
    (sickle cell disease[Title/Abstract]) AND
    (therapy[Title/Abstract])
""", max_results=100)

for article in results:
    print(f"Title: {article.title}")
    print(f"PMID: {article.pubmed_id}")
    print(f"DOI: {article.doi}")
```

#### arXiv検索

```python
import arxiv

search = arxiv.Search(
    query="machine learning healthcare",
    max_results=50,
    sort_by=arxiv.SortCriterion.Relevance
)

for paper in search.results():
    print(f"Title: {paper.title}")
    print(f"arXiv ID: {paper.entry_id}")
    print(f"DOI: {paper.doi}")
```

#### Perplexity AI検索（最新情報）

```python
import litellm
import os

os.environ["OPENROUTER_API_KEY"] = "your-api-key"

response = litellm.completion(
    model="openrouter/perplexity/sonar-pro",
    messages=[{
        "role": "user",
        "content": """
        最新のCRISPR治療に関する研究動向を教えてください。
        2024年以降の主要な発表を含めてください。
        """
    }]
)

print(response.choices[0].message.content)
```

### ステップ3: 引用情報の抽出・検証

```python
# DOIからBibTeX生成
def doi_to_bibtex(doi):
    """DOIから完全なBibTeX エントリを生成"""
    import requests

    url = f"https://doi.org/{doi}"
    headers = {"Accept": "application/x-bibtex"}

    response = requests.get(url, headers=headers)
    return response.text

# PMIDからメタデータ抽出
def pmid_to_metadata(pmid):
    """PMIDから完全なメタデータを抽出"""
    from pymed import PubMed

    pubmed = PubMed(tool="research-tool", email="researcher@example.com")
    results = list(pubmed.query(pmid, max_results=1))

    if results:
        article = results[0]
        return {
            "title": article.title,
            "authors": [a["lastname"] for a in article.authors],
            "journal": article.journal,
            "year": article.publication_date[:4],
            "doi": article.doi,
            "pmid": article.pubmed_id
        }
    return None
```

### ステップ4: 系統的レビューの実施

```python
def systematic_review(query, databases, inclusion_criteria, exclusion_criteria):
    """
    系統的文献レビューの実施

    Args:
        query: 検索クエリ
        databases: 検索対象データベースリスト
        inclusion_criteria: 選択基準
        exclusion_criteria: 除外基準

    Returns:
        PRISMA形式のレビューレポート
    """
    results = {
        "identified": 0,
        "duplicates_removed": 0,
        "screened": 0,
        "excluded": 0,
        "full_text_reviewed": 0,
        "included": 0,
        "papers": []
    }

    # 各データベースから検索
    all_papers = []
    for db in databases:
        papers = search_database(db, query)
        all_papers.extend(papers)

    results["identified"] = len(all_papers)

    # 重複除去
    unique_papers = remove_duplicates(all_papers)
    results["duplicates_removed"] = results["identified"] - len(unique_papers)

    # スクリーニング
    screened = screen_by_title_abstract(unique_papers, inclusion_criteria)
    results["screened"] = len(screened)

    # フルテキストレビュー
    included = full_text_review(screened, exclusion_criteria)
    results["included"] = len(included)
    results["papers"] = included

    return results
```

### ステップ5: BibTeX管理

```python
import bibtexparser

def manage_bibliography(bib_file, new_entries):
    """BibTeX ファイルの管理と更新"""

    with open(bib_file, 'r') as f:
        bib_database = bibtexparser.load(f)

    # 重複チェック
    existing_keys = set(bib_database.entries_dict.keys())

    for entry in new_entries:
        # キー生成
        key = generate_bibtex_key(entry)

        if key not in existing_keys:
            bib_database.entries.append(entry)
            existing_keys.add(key)

    # 保存
    with open(bib_file, 'w') as f:
        bibtexparser.dump(bib_database, f)

    return len(new_entries)
```

## データベース対応

| データベース | 検索タイプ | 主な用途 |
|--------------|------------|----------|
| PubMed/MEDLINE | API直接 | 生物医学、臨床研究 |
| arXiv | API直接 | 物理学、数学、CS |
| bioRxiv/medRxiv | API直接 | プレプリント |
| Semantic Scholar | API直接 | 包括的検索、引用分析 |
| Google Scholar | スクレイピング | 包括的検索 |
| Perplexity AI | API直接 | 最新情報、リアルタイム |

## 引用スタイル対応

| スタイル | 用途 | フォーマット例 |
|----------|------|----------------|
| APA | 心理学、社会科学 | Author, A. A. (Year). Title. Journal, Vol(Issue), Pages. |
| Vancouver | 医学、生物医学 | Author AA. Title. Journal. Year;Vol(Issue):Pages. |
| Nature | 自然科学 | Author, A. et al. Title. Journal Vol, Pages (Year). |
| IEEE | 工学、CS | [1] A. Author, "Title," Journal, vol. X, pp. Y-Z, Year. |
| Chicago | 人文科学 | Author, First. "Title." Journal Vol, no. Issue (Year): Pages. |

## スクリプト

### literature_search.py
```bash
python scripts/literature_search.py \
    --query "CRISPR sickle cell disease therapy" \
    --databases pubmed,arxiv,semantic-scholar \
    --output results/search_results.json \
    --max-results 100
```

### citation_manager.py
```bash
python scripts/citation_manager.py \
    --input papers.csv \
    --output bibliography.bib \
    --style apa \
    --validate
```

### web_research.py
```bash
python scripts/web_research.py \
    --query "最新のAI医療応用 2024" \
    --model sonar-pro \
    --output research_notes.md
```

## 他のスキルとの統合

### research-writing
収集した文献を論文執筆に活用。引用の自動挿入。

### research-critical
収集した文献の質を評価。バイアス検出。

### research-hypothesis
文献レビューから研究ギャップを特定し、仮説生成。

### research-grants
助成金申請書の関連研究セクション作成。

## 使用例

### 系統的レビューの実施

```python
# レビュー設定
config = {
    "topic": "Machine learning in cancer diagnosis",
    "databases": ["pubmed", "arxiv", "semantic-scholar"],
    "date_range": ("2020-01-01", "2024-12-31"),
    "inclusion_criteria": [
        "Original research",
        "Human studies",
        "Diagnostic accuracy reported"
    ],
    "exclusion_criteria": [
        "Review articles",
        "Case reports",
        "Non-English"
    ]
}

# レビュー実行
review = systematic_review(config)

# PRISMAフローチャート生成
generate_prisma_flowchart(review)

# レポート出力
generate_review_report(review, format="markdown")
```

### 引用の検証と修正

```python
# 既存のBibTeXファイルを検証
validation_results = validate_bibliography("references.bib")

for issue in validation_results["issues"]:
    print(f"Issue: {issue['type']}")
    print(f"  Entry: {issue['key']}")
    print(f"  Problem: {issue['message']}")

    # 自動修正
    if issue["auto_fixable"]:
        fix_bibtex_entry(issue["key"], issue["suggested_fix"])
```

### 最新研究のモニタリング

```python
# 定期的な新着論文チェック
def monitor_new_papers(keywords, since_date):
    """特定トピックの新着論文を監視"""

    query = " OR ".join(keywords)

    # 各データベースから最新を検索
    new_papers = []
    for db in ["pubmed", "arxiv", "bioRxiv"]:
        results = search_with_date_filter(db, query, since_date)
        new_papers.extend(results)

    # 重複除去と優先順位付け
    unique_papers = remove_duplicates(new_papers)
    prioritized = prioritize_by_relevance(unique_papers)

    return prioritized
```

## トラブルシューティング

### API制限エラー
**解決策:** レート制限を遵守し、適切な間隔を設定
```python
import time

def search_with_rate_limit(db, query, delay=0.5):
    time.sleep(delay)  # API呼び出し間隔
    return search_database(db, query)
```

### DOIが見つからない
**解決策:** 複数のソースから検索
```python
def find_doi_fallback(title, authors):
    # Crossref
    doi = search_crossref(title, authors)
    if doi:
        return doi

    # Semantic Scholar
    doi = search_semantic_scholar(title)
    if doi:
        return doi

    # Google Scholar（スクレイピング）
    return search_google_scholar(title)
```

### 引用形式の不一致
**解決策:** 統一されたスタイルガイドを適用
```python
from citeproc import CitationStylesStyle, CitationStylesBibliography

def format_citations(entries, style="apa"):
    bib_style = CitationStylesStyle(style)
    bibliography = CitationStylesBibliography(bib_style)

    for entry in entries:
        bibliography.register(entry)

    return bibliography.bibliography()
```

## ベストプラクティス

1. **体系的な検索**
   - PICO/SPIDERフレームワークの使用
   - 複数データベースの組み合わせ
   - 検索戦略の文書化

2. **引用の正確性**
   - DOI/PMIDによる検証
   - 複数ソースでの照合
   - 定期的なBibTeX更新

3. **再現性の確保**
   - 検索クエリの保存
   - PRISMAフローの記録
   - フィルタ基準の明記

4. **効率的な管理**
   - 重複の定期的削除
   - メタデータの統一
   - バックアップの作成

## リファレンス

### academic_databases.md
各データベースの詳細な使用方法、API仕様、検索テクニック。

### citation_styles.md
各引用スタイルの完全な仕様と例。

### search_strategies.md
ブール検索、メッシュターム、高度な検索テクニック。

### systematic_review.md
PRISMAガイドラインに基づく系統的レビューの実施方法。
