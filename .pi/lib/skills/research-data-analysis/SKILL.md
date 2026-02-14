---
name: research-data-analysis
description: 200以上の科学ファイル形式に対応した包括的EDA実行とデータ処理。科学データファイルの構造、内容、品質、特性を理解するために使用。大規模データ（Dask/Vaex）、高速処理（Polars）、形式変換（Markitdown）を統合。自動的にファイル形式を検出し、形式固有の分析、データ品質評価、統計サマリー、可視化推奨、ダウンストリーム分析提案を含む詳細なマークダウンレポートを生成する。
allowed-tools: [Read, Write, Edit, Bash]
license: MIT license
metadata:
  skill-author: "Mekann"
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research Data Analysis

> **統合スキル:** このスキルは exploratory-data-analysis, dask, polars, vaex, markitdown を統合したものです。

## 概要

**これは研究データ分析の中核スキルです**—200以上の科学ファイル形式に対応した包括的EDAと、大規模データ処理、高速データフレーム操作、形式変換を統合しています。

### 統合されたスキル

| 元スキル | 機能 |
|----------|------|
| exploratory-data-analysis | 200+科学フォーマット対応EDA、自動形式検出 |
| dask | 分散コンピューティング、RAM超過データ処理 |
| polars | 高速インメモリDataFrame、遅延評価 |
| vaex | アウトオブコア処理、10億行データ対応 |
| markitdown | PDF/DOCX/PPTX/XLSX等のMarkdown変換 |

## 使用タイミング

以下の場合に使用:
- 新しいデータセットの初期探索と理解
- データ品質評価と前処理計画
- 大規模データセット（RAMを超えるサイズ）の処理
- 高速なデータ変換と集計
- 科学ファイル形式の読み込みと分析
- 200+の科学フォーマットに対応した自動形式検出

## ワークフロー

### ステップ1: データサイズに基づくツール選択

```
データサイズ判定フロー:
├── < 1GB: Polars (高速インメモリ)
├── 1GB - 100GB: Polars (遅延評価) または Dask (シングルマシン)
├── 100GB - 1TB: Dask (分散) または Vaex (アウトオブコア)
└── > 1TB: Dask (クラスタ) または Vaex
```

### ステップ2: 形式検出と読み込み

```python
# 自動形式検出
from pathlib import Path
import magic

def detect_format(filepath):
    """200+の科学ファイル形式を自動検出"""
    # 一般形式
    common_formats = {
        '.csv': 'text/csv',
        '.parquet': 'apache/parquet',
        '.hdf5': 'hdf5',
        '.nc': 'netcdf',
        '.fits': 'fits',
        # 科学形式
        '.mzML': 'mass-spectrometry',
        '.fastq': 'bioinformatics',
        '.pdb': 'protein-structure',
        # ... 200+形式
    }
    return common_formats.get(Path(filepath).suffix, 'unknown')
```

### ステップ3: データ処理エンジン選択

#### Polars (高速インメモリ)

```python
import polars as pl

# 遅延評価で大規模データ対応
df = pl.scan_csv("large_data.csv")

# 高速集計
result = (
    df
    .filter(pl.col("value") > 100)
    .groupby("category")
    .agg([
        pl.col("value").mean().alias("mean_value"),
        pl.col("value").std().alias("std_value"),
        pl.count().alias("count")
    ])
    .collect()  # 実行
)
```

#### Dask (分散コンピューティング)

```python
import dask.dataframe as dd

# RAMを超えるデータの処理
df = dd.read_csv("huge_data/*.csv")

# 遅延評価
result = (
    df
    .groupby("category")
    .value
    .mean()
    .compute()  # 分散実行
)

# クラスタ設定
from dask.distributed import Client
client = Client("scheduler-address:8786")
```

#### Vaex (アウトオブコア)

```python
import vaex

# 10億行データの処理
df = vaex.open("billion_rows.hdf5")

# メモリに読み込まずに集計
result = (
    df
    .mean("value", selection="category == 'A'")
)

# 可視化も高速
df.plot1d("value", limits="99.7%")
```

### ステップ4: EDAレポート生成

```python
def generate_eda_report(data_path, output_dir):
    """
    包括的EDAレポートを生成

    Args:
        data_path: データファイルパス
        output_dir: 出力ディレクトリ

    Returns:
        Markdownレポート
    """
    # 1. 形式検出
    format_type = detect_format(data_path)

    # 2. データ読み込み（適切なエンジン選択）
    df = load_with_optimal_engine(data_path)

    # 3. 基本統計
    stats = compute_statistics(df)

    # 4. データ品質評価
    quality = assess_quality(df)

    # 5. 可視化推奨
    viz_recommendations = recommend_visualizations(df)

    # 6. レポート生成
    report = generate_markdown_report(
        format_type, stats, quality, viz_recommendations
    )

    return report
```

## サポート形式

### 一般データ形式

| カテゴリ | 形式 |
|----------|------|
| テーブル | CSV, TSV, Parquet, Feather, Arrow |
| Excel | XLSX, XLS, ODS |
| データベース | SQLite, DuckDB, PostgreSQL |
| JSON/XML | JSON, JSONL, XML, YAML |

### 科学データ形式

| 分野 | 形式 |
|------|------|
| 化学 | MOL, SDF, PDB, CML, XYZ |
| バイオインフォマティクス | FASTA, FASTQ, BAM, VCF, GFF |
| 画像 | TIFF, DICOM, NIfTI, CZI |
| 分光法 | mzML, mzXML, JCAMP-DX |
| 顕微鏡 | OME-TIFF, ND2, LIF |
| 天文学 | FITS, VOTable |
| 気象 | NetCDF, GRIB |
| 地理 | GeoTIFF, Shapefile, GeoJSON |

### ドキュメント形式

| 形式 | 変換元 | 変換先 |
|------|--------|--------|
| PDF | PDF | Markdown |
| Word | DOCX | Markdown |
| PowerPoint | PPTX | Markdown |
| Excel | XLSX | Markdown |

## リファレンス

### supported_formats.md
サポートされる200以上の科学ファイル形式の完全なリストと、各形式固有の処理方法。

### distributed_computing.md
Daskクラスタのセットアップ、分散処理のベストプラクティス、パフォーマンスチューニング。

### fast_dataframes.md
Polarsの高速化テクニック、遅延評価、クエリ最適化、メモリ効率的な操作。

### out_of_core.md
Vaexのアウトオブコア処理、仮想カラム、高速可視化、10億行データの取り扱い。

### format_conversion.md
Markitdownを使用した文書形式の変換、OCR、音声転写。

## スクリプト

### eda_workflow.py
```bash
python scripts/eda_workflow.py data.csv --output reports/
```

自動的に以下を実行:
- 形式検出
- 基本統計
- 欠損値分析
- 外れ値検出
- 分布可視化
- 相関分析

### large_data_processor.py
```bash
python scripts/large_data_processor.py huge_data.parquet \
    --engine dask \
    --operations "filter,groupby,aggregate" \
    --output result.parquet
```

### format_converter.py
```bash
python scripts/format_converter.py document.pdf --output document.md
python scripts/format_converter.py data.xlsx --output data.csv
```

## 他のスキルとの統合

### research-statistics
EDAで発見した分布に基づいて適切な統計検定を選択。

### research-visualization
EDAの結果を出版品質の図に変換。

### ml-classical
EDAで特定した特徴量を使用して機械学習パイプラインを構築。

### research-writing
EDA結果を論文のMethods/Resultsセクションに統合。

## 使用例

### 小規模データのEDA

```python
import polars as pl

# データ読み込み
df = pl.read_csv("experiment_data.csv")

# 基本統計
print(df.describe())

# 欠損値チェック
print(df.null_count())

# 分布確認
print(df.select([
    pl.col("value").mean(),
    pl.col("value").median(),
    pl.col("value").std(),
]))
```

### 大規模データの処理

```python
import dask.dataframe as dd
from dask.distributed import Client

# クラスタ接続
client = Client("scheduler:8786")

# データ読み込み
df = dd.read_parquet("s3://bucket/large_data/*.parquet")

# 集計処理
result = (
    df
    .groupby(["category", "date"])
    .agg({
        "value": ["mean", "std", "count"],
        "score": "sum"
    })
    .compute()
)
```

### 10億行データの可視化

```python
import vaex

# アウトオブコア読み込み
df = vaex.open("billion_rows.hdf5")

# メモリに読み込まずに可視化
df.plot1d("feature_1", limits="99.7%")
df.plot2d("feature_1", "feature_2", limits="99.7%")

# 仮想カラム作成（ディスク容量を消費しない）
df["normalized"] = (df.feature_1 - df.feature_1.mean()) / df.feature_1.std()
```

## トラブルシューティング

### メモリ不足エラー
**解決策:** より大きなデータに対応したエンジンに切り替え
- Polars -> Dask (シングルマシン)
- Dask (シングル) -> Dask (クラスタ) または Vaex

### 処理が遅い
**解決策:**
- Polars: `collect()`の呼び出しを最小化
- Dask: パーティションサイズを最適化 (100MB程度)
- Vaex: 仮想カラムを活用

### 形式が認識されない
**解決策:** 形式を明示的に指定
```python
df = pl.read_csv("data.txt", separator="\t")  # TSV
df = vaex.open("data.bin", format="hdf5")     # HDF5
```

## ベストプラクティス

1. **データサイズに応じたエンジン選択**
   - 小規模: Polars
   - 中規模: Dask (シングル)
   - 大規模: Vaex または Dask (クラスタ)

2. **遅延評価を活用**
   - 全ての変換を定義してから最後に実行
   - 不要な中間結果を避ける

3. **パーティション戦略**
   - Dask: 100MB程度のパーティション
   - 処理前にデータをソート・パーティション

4. **メモリ監視**
   - 処理前にデータサイズを推定
   - `memory_usage()`で監視

5. **段階的な探索**
   - サンプルで探索 -> 全体で検証
   - プロファイリングでボトルネック特定
