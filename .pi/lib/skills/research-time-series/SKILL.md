---
name: research-time-series
description: 時系列機械学習の専門ツールキット。分類、回帰、クラスタリング、予測、異常検出に対応。aeonライブラリをベース。
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-13"
  skill-author: "Mekann"
  integrated-from:
    - aeon
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research Time Series

> **統合スキル:** このスキルは aeon をベースにした時系列機械学習ツールキットです。

## 概要

時系列データの機械学習に特化したツールキット。分類、回帰、クラスタリング、予測、異常検出、セグメンテーションをscikit-learn互換APIで提供。

**主な機能:**
- 時系列分類（TSC）
- 時系列回帰（TSR）
- 時系列クラスタリング（TSCL）
- 時系列予測（Forecasting）
- 異常検出（Anomaly Detection）
- セグメンテーション

## セットアップ

```bash
# aeon本體
uv pip install aeon

# 追加機能
uv pip install aeon[all_extras]

# 可視化
uv pip install matplotlib seaborn
```

## 使用タイミング

| タスク | 使用場面 |
|--------|----------|
| 分類 | 時系列パターンの識別 |
| 回帰 | 時系列からの値予測 |
| クラスタリング | 類似時系列のグループ化 |
| 予測 | 将来値の予測 |
| 異常検出 | 外れ値・異常パターン検出 |

## ワークフロー

### 時系列分類

```python
from aeon.classification.interval_based import CanonicalIntervalForestClassifier
from aeon.datasets import load_basic_motions

# データ読み込み
X_train, y_train = load_basic_motions(split="train")
X_test, y_test = load_basic_motions(split="test")

# 分類器訓練
clf = CanonicalIntervalForestClassifier()
clf.fit(X_train, y_train)

# 予測
y_pred = clf.predict(X_test)

# 評価
from sklearn.metrics import accuracy_score
accuracy = accuracy_score(y_test, y_pred)
print(f"Accuracy: {accuracy:.3f}")
```

### 時系列クラスタリング

```python
from aeon.clustering import TimeSeriesKMeans
from aeon.datasets import load_arrow_head

# データ
X, y = load_arrow_head()

# k-means クラスタリング
kmeans = TimeSeriesKMeans(n_clusters=3, metric="dtw")
kmeans.fit(X)

# クラスタ割り当て
clusters = kmeans.predict(X)
```

### 時系列予測

```python
from aeon.forecasting import ARIMA, ExponentialSmoothing
from aeon.datasets import load_airline

# データ
y = load_airline()

# ARIMA モデル
forecaster = ARIMA(order=(1, 1, 1))
forecaster.fit(y)

# 予測
predictions = forecaster.predict(fh=[1, 2, 3, 4, 5])
```

### 異常検出

```python
from aeon.anomaly_detection import IsolationForest

# 異常検出器
detector = IsolationForest(contamination=0.1)
detector.fit(X_train)

# 異常スコア
scores = detector.predict_proba(X_test)
```

## 主要アルゴリズム

### 分類

| アルゴリズム | 特徴 | 推奨用途 |
|--------------|------|----------|
| CanonicalIntervalForest | 区間ベース | 汎用 |
| ROCKET | ランダムカーネル | 高速 |
| InceptionTime | ディープラーニング | 複雑パターン |
| HIVE-COTE | アンサンブル | 最高精度 |

### クラスタリング

| アルゴリズム | 特徴 | 推奨用途 |
|--------------|------|----------|
| TimeSeriesKMeans | DTW距離 | ベースライン |
| KShape | シェープベース | 類似形状 |
| KMedoids | メドイドベース | 外れ値に強い |

### 予測

| アルゴリズム | 特徴 | 推奨用途 |
|--------------|------|----------|
| ARIMA | 統計的 | 定常時系列 |
| ExponentialSmoothing | 統計的 | トレンド・季節性 |
| Prophet | 加法モデル | 実務データ |
| N-BEATS | ニューラル | 高精度 |

## データ形式

```python
# 単変量時系列: (n_samples, n_timepoints)
X_univariate = np.random.rand(100, 50)

# 多変量時系列: (n_samples, n_channels, n_timepoints)
X_multivariate = np.random.rand(100, 3, 50)

# 不等長時系列: list of arrays
X_unequal = [np.random.rand(30), np.random.rand(45), np.random.rand(35)]
```

## ベストプラクティス

### 1. データ前処理

```python
from aeon.transformations.collection import Normalizer, Resizer

# 正規化
normalizer = Normalizer()
X_normalized = normalizer.fit_transform(X)

# リサイズ（等長化）
resizer = Resizer(length=100)
X_resized = resizer.fit_transform(X)
```

### 2. モデル選択

```python
from aeon.classification import DummyClassifier
from aeon.classification.distance_based import KNeighborsTimeSeriesClassifier
from aeon.classification.dictionary_based import WEASEL

# ベースライン
dummy = DummyClassifier()

# k-NN（DTW）
knn = KNeighborsTimeSeriesClassifier(distance="dtw")

# 辞書ベース
weasel = WEASEL()
```

### 3. クロスバリデーション

```python
from sklearn.model_selection import cross_val_score
from aeon.classification.interval_based import TimeSeriesForestClassifier

clf = TimeSeriesForestClassifier()
scores = cross_val_score(clf, X, y, cv=5)
print(f"CV Accuracy: {scores.mean():.3f} (+/- {scores.std():.3f})")
```

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 遅い訓練 | DTWの計算コスト | 近似DTW、サンプリング |
| メモリエラー | 大きなデータセット | バッチ処理 |
| 過学習 | 複雑なモデル | 正則化、簡素なモデル |
| 不等長エラー | 形式不一致 | Resizerで等長化 |

## 関連スキル

- [research-ml-classical](../research-ml-classical/): クラシックML
- [research-statistics](../research-statistics/): 統計分析
- [research-visualization](../research-visualization/): 可視化

---

*このスキルは時系列機械学習の専門ツールキットを提供します。*
*ベース: aeon*
