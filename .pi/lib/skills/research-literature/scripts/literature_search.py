#!/usr/bin/env python3
"""
文献検索・分析スクリプト
PubMed、arXiv、Semantic Scholarから文献を検索・収集
"""

import requests
import json
from typing import List, Dict, Optional
from datetime import datetime

class LiteratureSearcher:
    """統合文献検索クラス"""
    
    def __init__(self):
        self.pubmed_base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
        self.arxiv_base = "http://export.arxiv.org/api/query"
        self.semantic_scholar_base = "https://api.semanticscholar.org/graph/v1"
    
    def search_pubmed(self, query: str, max_results: int = 20) -> List[Dict]:
        """PubMedで検索"""
        # ESearch
        search_url = f"{self.pubmed_base}/esearch.fcgi"
        params = {
            "db": "pubmed",
            "term": query,
            "retmax": max_results,
            "retmode": "json"
        }
        
        response = requests.get(search_url, params=params)
        data = response.json()
        
        if "esearchresult" not in data:
            return []
        
        pmids = data["esearchresult"]["idlist"]
        
        # EFetch for details
        if not pmids:
            return []
        
        fetch_url = f"{self.pubmed_base}/esummary.fcgi"
        params = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "json"
        }
        
        response = requests.get(fetch_url, params=params)
        summary_data = response.json()
        
        results = []
        for pmid in pmids:
            if str(pmid) in summary_data.get("result", {}):
                article = summary_data["result"][str(pmid)]
                results.append({
                    "pmid": pmid,
                    "title": article.get("title", ""),
                    "authors": article.get("authors", []),
                    "journal": article.get("fulljournalname", ""),
                    "pubdate": article.get("pubdate", ""),
                    "source": "pubmed"
                })
        
        return results
    
    def search_arxiv(self, query: str, max_results: int = 20) -> List[Dict]:
        """arXivで検索"""
        import xml.etree.ElementTree as ET
        
        params = {
            "search_query": f"all:{query}",
            "max_results": max_results
        }
        
        response = requests.get(self.arxiv_base, params=params)
        root = ET.fromstring(response.content)
        
        # XML名前空間
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        
        results = []
        for entry in root.findall("atom:entry", ns):
            title = entry.find("atom:title", ns).text.strip()
            summary = entry.find("atom:summary", ns).text.strip()
            published = entry.find("atom:published", ns).text
            
            authors = []
            for author in entry.findall("atom:author", ns):
                name = author.find("atom:name", ns)
                if name is not None:
                    authors.append(name.text)
            
            arxiv_id = entry.find("atom:id", ns).text.split("/")[-1]
            
            results.append({
                "arxiv_id": arxiv_id,
                "title": title,
                "authors": authors,
                "abstract": summary[:500] + "..." if len(summary) > 500 else summary,
                "pubdate": published[:10],
                "source": "arxiv"
            })
        
        return results
    
    def search_semantic_scholar(self, query: str, max_results: int = 20) -> List[Dict]:
        """Semantic Scholarで検索"""
        url = f"{self.semantic_scholar_base}/paper/search"
        params = {
            "query": query,
            "limit": max_results,
            "fields": "title,authors,year,abstract,citationCount,url"
        }
        
        response = requests.get(url, params=params)
        data = response.json()
        
        results = []
        for paper in data.get("data", []):
            results.append({
                "paper_id": paper.get("paperId"),
                "title": paper.get("title", ""),
                "authors": [a.get("name", "") for a in paper.get("authors", [])],
                "year": paper.get("year"),
                "abstract": paper.get("abstract", ""),
                "citations": paper.get("citationCount", 0),
                "url": paper.get("url", ""),
                "source": "semantic_scholar"
            })
        
        return results
    
    def search_all(self, query: str, max_results: int = 20) -> Dict[str, List[Dict]]:
        """全データベースで検索"""
        return {
            "pubmed": self.search_pubmed(query, max_results),
            "arxiv": self.search_arxiv(query, max_results),
            "semantic_scholar": self.search_semantic_scholar(query, max_results)
        }


def generate_bibtex(article: Dict, source: str) -> str:
    """BibTeX形式で出力"""
    if source == "pubmed":
        cite_key = f"pubmed{article['pmid']}"
        authors = " and ".join([a.get("name", "") for a in article.get("authors", [])])
        return f"""@article{{{cite_key},
    title = {{{article['title']}}},
    author = {{{authors}}},
    journal = {{{article.get('journal', '')}}},
    year = {{{article.get('pubdate', '')[:4]}}},
    pmid = {{{article['pmid']}}}
}}"""
    elif source == "arxiv":
        cite_key = f"arxiv{article['arxiv_id'].replace('.', '')}"
        authors = " and ".join(article.get("authors", []))
        return f"""@article{{{cite_key},
    title = {{{article['title']}}},
    author = {{{authors}}},
    journal = {{arXiv preprint}},
    year = {{{article['pubdate'][:4]}}},
    eprint = {{{article['arxiv_id']}}}
}}"""
    return ""


if __name__ == "__main__":
    # 使用例
    searcher = LiteratureSearcher()
    
    # 検索実行
    results = searcher.search_all("machine learning healthcare", max_results=5)
    
    # 結果表示
    for source, articles in results.items():
        print(f"\n=== {source.upper()} ({len(articles)} results) ===")
        for article in articles[:3]:
            print(f"- {article.get('title', 'No title')}")
            if source == "pubmed":
                print(f"  BibTeX:\n{generate_bibtex(article, source)}")
