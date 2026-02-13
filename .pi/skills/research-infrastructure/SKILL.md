---
name: research-infrastructure
description: 研究インフラの統合ツールキット。リソース検出、クラウド実行、ネットワーク分析を統合。
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-13"
  skill-author: "Mekann"
  integrated-from:
    - get-available-resources
    - modal
    - networkx
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research Infrastructure

> **統合スキル:** このスキルは get-available-resources, modal, networkx を統合したものです。

## 概要

研究インフラの統合ツールキット。システムリソース検出、クラウド実行、ネットワーク分析を提供。

**主な機能:**
- リソース検出: CPU、GPU、メモリ、ディスク
- クラウド実行: Modalサーバーレス
- ネットワーク分析: NetworkX

## セットアップ

```bash
# リソース検出
uv pip install psutil gpustat

# クラウド実行
uv pip install modal

# ネットワーク分析
uv pip install networkx

# 可視化
uv pip install matplotlib
```

## 使用タイミング

| タスク | 推奨ツール |
|--------|-----------|
| リソース確認 | get-available-resources |
| クラウド実行 | Modal |
| ネットワーク分析 | NetworkX |
| 大規模計算 | Modal |

## ワークフロー

### リソース検出

```python
import psutil
import json

def get_system_resources():
    """システムリソース情報を取得"""
    
    resources = {
        "cpu": {
            "cores_physical": psutil.cpu_count(logical=False),
            "cores_logical": psutil.cpu_count(logical=True),
            "usage_percent": psutil.cpu_percent(interval=1)
        },
        "memory": {
            "total_gb": psutil.virtual_memory().total / (1024**3),
            "available_gb": psutil.virtual_memory().available / (1024**3),
            "usage_percent": psutil.virtual_memory().percent
        },
        "disk": {
            "total_gb": psutil.disk_usage('/').total / (1024**3),
            "free_gb": psutil.disk_usage('/').free / (1024**3),
            "usage_percent": psutil.disk_usage('/').percent
        }
    }
    
    # GPU情報（利用可能な場合）
    try:
        import GPUtil
        gpus = GPUtil.getGPUs()
        resources["gpu"] = [
            {
                "id": gpu.id,
                "name": gpu.name,
                "memory_total_gb": gpu.memoryTotal / 1024,
                "memory_used_gb": gpu.memoryUsed / 1024,
                "load_percent": gpu.load * 100
            }
            for gpu in gpus
        ]
    except:
        resources["gpu"] = "Not available"
    
    return resources

# 使用例
resources = get_system_resources()
print(json.dumps(resources, indent=2))
```

### Modal クラウド実行

```python
import modal

# Modalアプリ定義
app = modal.App("research-compute")

# イメージ設定
image = modal.Image.debian_slim().pip_install(
    "numpy", "pandas", "scikit-learn"
)

# GPU関数
@app.function(
    image=image,
    gpu="A100",
    timeout=3600
)
def train_model(data_path):
    import numpy as np
    from sklearn.ensemble import RandomForestClassifier
    
    # モデル訓練
    # ...
    
    return {"accuracy": 0.95}

# CPU関数
@app.function(image=image, cpu=4)
def preprocess_data(raw_data):
    import pandas as pd
    
    # 前処理
    # ...
    
    return processed_data

# ローカル実行
if __name__ == "__main__":
    with app.run():
        result = train_model.remote("s3://bucket/data.csv")
        print(result)
```

### NetworkX ネットワーク分析

```python
import networkx as nx
import matplotlib.pyplot as plt

# グラフ作成
G = nx.Graph()

# ノード・エッジ追加
G.add_nodes_from([1, 2, 3, 4, 5])
G.add_edges_from([(1, 2), (2, 3), (3, 4), (4, 5), (5, 1), (1, 3)])

# 中心性指標
degree_centrality = nx.degree_centrality(G)
betweenness_centrality = nx.betweenness_centrality(G)
closeness_centrality = nx.closeness_centrality(G)
eigenvector_centrality = nx.eigenvector_centrality(G)

# コミュニティ検出
from networkx.algorithms import community
communities = community.greedy_modularity_communities(G)

# 最短経路
shortest_path = nx.shortest_path(G, source=1, target=4)

# 可視化
nx.draw(G, with_labels=True, node_color='lightblue', 
        node_size=500, font_size=10)
plt.savefig('network.png')
```

## リソース戦略

### 処理規模別推奨

| データサイズ | CPU | GPU | 推奨ツール |
|--------------|-----|-----|------------|
| <1GB | ローカル | 不要 | pandas |
| 1-10GB | 4+ cores | オプション | polars, dask |
| 10-100GB | クラウド | 推奨 | Modal GPU |
| >100GB | クラウド分散 | 必須 | Modal cluster |

### 計算集約度別

| 計算タイプ | 推奨リソース |
|------------|--------------|
| 前処理 | CPU多コア |
| ML訓練 | GPU (A100) |
| 推論 | CPU/GPU |
| シミュレーション | クラウド |

## NetworkX 主要機能

### グラフタイプ

| タイプ | 作成 | 用途 |
|--------|------|------|
| 無向グラフ | `nx.Graph()` | ソーシャルネットワーク |
| 有向グラフ | `nx.DiGraph()` | Webリンク、引用 |
| 重み付き | `G.add_weighted_edges_from()` | 距離、コスト |
| 多重グラフ | `nx.MultiGraph()` | 複数関係 |

### 分析指標

| 指標 | 関数 | 意味 |
|------|------|------|
| 次数中心性 | `degree_centrality()` | 接続数の多さ |
| 媒介中心性 | `betweenness_centrality()` | 情報の仲介役 |
| 近接中心性 | `closeness_centrality()` | 他ノードへの近さ |
| 固有ベクトル中心性 | `eigenvector_centrality()` | 重要ノードとの接続 |
| PageRank | `pagerank()` | Webページ重要度 |

## ベストプラクティス

### Modal

1. **イメージの再利用**: 共通イメージを使い回す
2. **タイムアウト設定**: 長時間実行に注意
3. **ボリューム活用**: 大きなデータはVolumeで
4. **シークレット管理**: API キーはSecretsで

### NetworkX

1. **グラフタイプ選択**: 有向/無向を適切に
2. **大規模グラフ**: 返り値の大きさに注意
3. **可視化**: レイアウトアルゴリズムを選択

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| Modalタイムアウト | 処理時間超過 | timeout増加または最適化 |
| GPU検出できない | ドライバー問題 | CUDA確認 |
| ネットワーク計算遅い | 大規模グラフ | サンプリング |
| メモリ不足 | ノード数過多 | バッチ処理 |

## 関連スキル

- [research-ml-deep](../research-ml-deep/): ディープラーニング
- [research-data-analysis](../research-data-analysis/): データ処理
- [research-simulation](../research-simulation/): シミュレーション

---

*このスキルは研究インフラの統合ツールキットを提供します。*
*統合元: get-available-resources, modal, networkx*
