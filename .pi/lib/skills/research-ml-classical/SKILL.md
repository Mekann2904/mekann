---
name: research-ml-classical
description: クラシック機械学習の包括的ツールキット。教師あり/なし学習、モデル解釈性、次元削減を統合。scikit-learn、SHAP、UMAPを含む。
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-13"
  skill-author: "Mekann"
  integrated-from:
    - scikit-learn
    - shap
    - umap-learn
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research ML Classical

> **統合スキル:** このスキルは scikit-learn, shap, umap-learn を統合したものです。

## 概要

クラシック機械学習の包括的ツールキット。教師あり学習（分類・回帰）、教師なし学習（クラスタリング・次元削減）、モデル解釈性、特徴量エンジニアリングを統合的に提供。

**主な機能:**
- 教師あり学習（分類・回帰）
- 教師なし学習（クラスタリング・次元削減）
- モデル解釈性（SHAP値）
- 高次元データの可視化（UMAP）
- パイプライン構築とハイパーパラメータチューニング

## セットアップ

```bash
# 基本ML
uv pip install scikit-learn pandas numpy

# 解釈性
uv pip install shap

# 次元削減
uv pip install umap-learn

# 可視化
uv pip install matplotlib seaborn
```

## 使用タイミング

| タスク | 推奨ツール |
|--------|-----------|
| 分類・回帰 | scikit-learn |
| クラスタリング | scikit-learn, UMAP |
| 特徴量重要度 | SHAP |
| 高次元可視化 | UMAP |
| パイプライン | scikit-learn Pipeline |

## ワークフロー

### フェーズ1: データ前処理

```python
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split

# データ分割
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# スケーリング
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
```

### フェーズ2: モデル訓練

```python
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.model_selection import cross_val_score, GridSearchCV

# 基本モデル
models = {
    'rf': RandomForestClassifier(n_estimators=100, random_state=42),
    'gb': GradientBoostingClassifier(random_state=42),
    'lr': LogisticRegression(max_iter=1000),
    'svm': SVC(probability=True)
}

# クロスバリデーション
for name, model in models.items():
    scores = cross_val_score(model, X_train_scaled, y_train, cv=5)
    print(f"{name}: {scores.mean():.3f} (+/- {scores.std():.3f})")
```

### フェーズ3: ハイパーパラメータチューニング

```python
from sklearn.model_selection import RandomizedSearchCV
from scipy.stats import randint, uniform

param_dist = {
    'n_estimators': randint(50, 300),
    'max_depth': randint(3, 20),
    'min_samples_split': randint(2, 20),
    'min_samples_leaf': randint(1, 10)
}

search = RandomizedSearchCV(
    RandomForestClassifier(random_state=42),
    param_dist,
    n_iter=50,
    cv=5,
    scoring='accuracy',
    n_jobs=-1,
    random_state=42
)
search.fit(X_train_scaled, y_train)
```

### フェーズ4: モデル解釈（SHAP）

```python
import shap

# TreeExplainer for tree-based models
explainer = shap.TreeExplainer(search.best_estimator_)
shap_values = explainer.shap_values(X_test_scaled)

# 特徴量重要度
shap.summary_plot(shap_values, X_test_scaled, feature_names=feature_names)

# 個別予測の説明
shap.force_plot(explainer.expected_value[0], shap_values[0][0], X_test_scaled[0])
```

### フェーズ5: 次元削減と可視化（UMAP）

```python
import umap
import matplotlib.pyplot as plt

# UMAPで次元削減
reducer = umap.UMAP(n_neighbors=15, min_dist=0.1, metric='euclidean')
embedding = reducer.fit_transform(X_train_scaled)

# 可視化
plt.figure(figsize=(10, 8))
scatter = plt.scatter(embedding[:, 0], embedding[:, 1], c=y_train, cmap='viridis', alpha=0.6)
plt.colorbar(scatter)
plt.title('UMAP Projection')
plt.show()
```

## モジュール構成

### 1. 分類（Classification）

| アルゴリズム | 用途 | 特徴 |
|--------------|------|------|
| LogisticRegression | 線形分類 | 解釈しやすい、ベースライン |
| RandomForest | 汎用 | アンサンブル、特徴量重要度 |
| GradientBoosting | 高性能 | 勾配ブースティング |
| SVC | 複雑な境界 | カーネル法 |
| XGBoost/LightGBM | 大規模データ | 高速、高精度 |

### 2. 回帰（Regression）

| アルゴリズム | 用途 | 特徴 |
|--------------|------|------|
| LinearRegression | 線形関係 | ベースライン |
| Ridge/Lasso | 正則化 | 過学習防止 |
| RandomForestRegressor | 非線形 | アンサンブル |
| GradientBoostingRegressor | 高性能 | 勾配ブースティング |

### 3. クラスタリング（Clustering）

| アルゴリズム | 用途 | 特徴 |
|--------------|------|------|
| KMeans | 球形クラスタ | 高速、k指定必要 |
| DBSCAN | 任意形状 | ノイズ検出、密度ベース |
| Agglomerative | 階層的 | デンドログラム可視化 |
| GaussianMixture | 確率的 | ソフトクラスタリング |

### 4. 次元削減（Dimensionality Reduction）

| 手法 | 用途 | 特徴 |
|------|------|------|
| PCA | 線形削減 | 分散最大化 |
| UMAP | 非線形可視化 | 構造保存 |
| t-SNE | 可視化 | 局所構造重視 |
| TruncatedSVD | スパースデータ | テキストなど |

### 5. 解釈性（Interpretability）

| 手法 | 用途 | 特徴 |
|------|------|------|
| SHAP | 特徴量貢献 | ゲーム理論ベース |
| Permutation Importance | 重要度評価 | モデル非依存 |
| Partial Dependence | 効果可視化 | 特徴量と予測の関係 |

## パイプライン構築

```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder

# 数値・カテゴリ変数の前処理
numeric_features = ['age', 'income']
categorical_features = ['gender', 'occupation']

numeric_transformer = Pipeline(steps=[
    ('imputer', SimpleImputer(strategy='median')),
    ('scaler', StandardScaler())
])

categorical_transformer = Pipeline(steps=[
    ('imputer', SimpleImputer(strategy='constant', fill_value='missing')),
    ('onehot', OneHotEncoder(handle_unknown='ignore'))
])

preprocessor = ColumnTransformer(
    transformers=[
        ('num', numeric_transformer, numeric_features),
        ('cat', categorical_transformer, categorical_features)
    ]
)

# 完全パイプライン
clf = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('classifier', RandomForestClassifier(n_estimators=100))
])

clf.fit(X_train, y_train)
```

## ベストプラクティス

### モデル選択

1. **ベースラインから開始**: LogisticRegression、RandomForest
2. **データサイズで判断**: 小→SVM、大→GBDT
3. **解釈性重視**: Linear系、SHAP可能なモデル
4. **性能重視**: XGBoost、LightGBM

### ハイパーパラメータ

1. **RandomizedSearchCVを優先**: GridSearchCVより効率的
2. **クロスバリデーション必須**: 過学習防止
3. **評価指標の選択**: accuracy、F1、AUCなど適切に

### 解釈性

1. **SHAP summary_plot**: 全体の特徴量重要度
2. **SHAP force_plot**: 個別予測の説明
3. **dependence_plot**: 特徴量間の相互作用

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| メモリエラー | データが大きい | サンプリング、chunk処理 |
| 収束しない | スケーリング不足 | StandardScaler適用 |
| 過学習 | モデルが複雑 | 正則化、特徴量削減 |
| SHAPが遅い | サンプル数が多い | TreeExplainer使用、サンプリング |

## 関連スキル

- [research-statistics](../research-statistics/): 統計的検定
- [research-visualization](../research-visualization/): 可視化
- [research-data-analysis](../research-data-analysis/): データ処理
- [research-ml-deep](../research-ml-deep/): ディープラーニング

---

*このスキルはクラシック機械学習の包括的ツールキットを提供します。*
*統合元: scikit-learn, shap, umap-learn*
