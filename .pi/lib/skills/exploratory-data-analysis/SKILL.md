---
name: exploratory-data-analysis
description: 200以上の科学ファイル形式に対応した包括的EDA実行。科学データファイルの構造、内容、品質、特性を理解するために使用。自動的にファイル形式を検出し、形式固有の分析、データ品質評価、統計サマリー、可視化推奨、ダウンストリーム分析提案を含む詳細なマークダウンレポートを生成する。chemistry, bioinformatics, microscopy, spectroscopy, proteomics, metabolomics, general scientific formatsに対応。
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-13"
  skill-author: "Mekann"
  categories: chemistry,bioinformatics,microscopy,spectroscopy,proteomics,metabolomics,general-scientific
  file-formats: "200+"
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# 探索的データ分析 (Exploratory Data Analysis)

> **参考実装:** このスキルは [K-Dense AI Claude Scientific Skills](https://github.com/K-Dense-AI/claude-scientific-skills/tree/main/exploratory-data-analysis) を参考に作成されました。

## 概要

科学データファイルに対する包括的探索的データ分析（EDA）を実行。200以上の科学ファイル形式に対応し、自動ファイル形式検出、形式固有分析、データ品質評価、マークダウンレポート生成を提供。

**主な機能:**
- 200+科学ファイル形式の自動検出・分析
- 形式固有メタデータ抽出と構造解析
- データ品質・整合性評価
- 統計サマリーと分布分析
- 可視化推奨とダウンストリーム分析提案
- マークダウンレポート自動生成

## セットアップ

### 必須ライブラリ

```bash
# 基本分析用
uv pip install pandas numpy scipy

# バイオインフォマティクス
uv pip install biopython pysam pybigwig

# 化学・分子構造
uv pip install rdkit mdanalysis

# 顕微鏡・イメージング
uv pip install tifffile nd2reader aicsimageio pydicom scikit-image

# 分光法・質量分析
uv pip install nmrglue pymzml pyteomics matchms

# 一般データ処理
uv pip install h5py zarr openpyxl
```

### オプションライブラリ

```bash
# 追加の分子動力学
uv pip install mdtraj

# 追加のイメージング
uv pip install pims imageio

# 追加の統計・可視化
uv pip install matplotlib seaborn
```

## 使用方法

### 基本的な使用

```bash
# スキルをロード
/skill:exploratory-data-analysis

# 引数付きで実行
/skill:exploratory-data-analysis data.fastq
```

### スクリプト直接実行

```bash
# 基本的な分析
python scripts/eda_analyzer.py data.csv

# 出力ファイルを指定
python scripts/eda_analyzer.py data.fastq report.md

# 詳細モード
python scripts/eda_analyzer.py data.h5 --verbose
```

## 使用タイミング

以下の場合にこのスキルを使用:

- 科学データファイルのパスが提供されたとき
- データセットの構造・内容を理解したいとき
- 分析前の包括的レポートが必要なとき
- データ品質・完全性を評価したいとき
- ファイルに適切な分析手法を知りたいとき

**特に推奨される場面:**
- 新規データセットの最初の分析
- 分析パイプライン設計前のデータ理解
- データ品質評価とクリーニング計画
- 多くの未知ファイル形式を扱う場合

## 対応ファイルカテゴリ

| カテゴリ | 拡張子数 | 主な形式 | リファレンス |
|----------|----------|----------|--------------|
| 化学・分子 | 60+ | .pdb, .mol, .sdf, .xyz, .cif | [chemistry_molecular_formats.md](references/chemistry_molecular_formats.md) |
| バイオインフォマティクス | 50+ | .fasta, .fastq, .bam, .vcf, .bed | [bioinformatics_genomics_formats.md](references/bioinformatics_genomics_formats.md) |
| 顕微鏡・イメージング | 45+ | .tif, .nd2, .czi, .dcm, .nii | [microscopy_imaging_formats.md](references/microscopy_imaging_formats.md) |
| 分光法・分析化学 | 35+ | .mzML, .fid, .spc, .jdx, .raw | [spectroscopy_analytical_formats.md](references/spectroscopy_analytical_formats.md) |
| プロテオミクス・メタボロミクス | 30+ | .mzML, .pepXML, .mzid, .mzTab | [proteomics_metabolomics_formats.md](references/proteomics_metabolomics_formats.md) |
| 一般科学データ | 30+ | .csv, .hdf5, .npy, .json, .parquet | [general_scientific_formats.md](references/general_scientific_formats.md) |

## ワークフロー

### フェーズ1: ファイル形式検出

```
入力: ファイルパス
↓
1. 拡張子を抽出
2. 適切なリファレンスファイルで拡張子を検索
3. ファイルカテゴリと形式説明を特定
4. 形式固有のEDAアプローチを取得
↓
出力: 形式情報、推奨分析手法
```

**例:**
```
入力: "reads.fastq"
→ 拡張子: .fastq
→ カテゴリ: bioinformatics_genomics
→ 形式: FASTQ (品質スコア付き配列データ)
→ リファレンス: references/bioinformatics_genomics_formats.md
→ EDAアプローチ: 配列数、長さ分布、GC含量、品質スコア分析
```

### フェーズ2: 形式固有情報の読み込み

リファレンスファイルから以下の情報を取得:
- **説明:** 形式の概要
- **典型的データ:** 含まれるデータの種類
- **用途:** 一般的な使用場面
- **Pythonライブラリ:** 読み込み方法とコード例
- **EDAアプローチ:** 推奨される分析手順

### フェーズ3: データ分析実行

#### データタイプ別分析アプローチ

| データタイプ | 分析内容 | 使用ライブラリ |
|--------------|----------|----------------|
| **表形式** (CSV, TSV, Excel) | 次元、データ型、欠損値、統計、相関、外れ値、重複 | pandas, numpy |
| **配列** (FASTA, FASTQ) | 配列数、長さ分布、GC含量、品質スコア、N50 | Biopython |
| **画像** (TIFF, ND2, CZI) | 次元(XYZCT)、ビット深度、チャンネル、強度統計 | tifffile, scikit-image |
| **分子構造** (PDB, MOL) | 原子数、残基、B因子、結合長、構造検証 | Biopython, MDAnalysis |
| **質量分析** (mzML, mzXML) | スペクトル数、m/z範囲、TIC、MSレベル分布 | pymzml, pyteomics |
| **階層データ** (HDF5, Zarr) | グループ構造、データセット形状、属性、圧縮 | h5py, zarr |

### フェーズ4: レポート生成

#### レポート構造

```markdown
# EDAレポート: {ファイル名}

**生成日時:** {TIMESTAMP}

## エグゼクティブサマリー
- データ概要の要約
- 主要な品質指標
- 推奨される次のステップ

## 基本情報
- ファイルサイズ、形式、カテゴリ

## 形式詳細
- 形式の説明
- 典型的なデータ内容
- Python読み込みライブラリ

## データ構造分析
- 次元、データ型、構造

## 統計サマリー
- 数値変数の統計
- カテゴリ変数の分布

## 品質評価
- 欠損値
- 外れ値
- データ整合性

## 推奨事項
- 前処理ステップ
- 適切な分析手法
- 可視化アプローチ

## トラブルシューティング
- 検出された問題
- 解決策の提案
```

**テンプレート:** [assets/report_template.md](assets/report_template.md)

### フェーズ5: レポート保存

```
パターン: {元のファイル名}_eda_report.md
例: experiment_data.fastq → experiment_data_eda_report.md
```

## リファレンスファイルの使用方法

### 形式情報の検索

各リファレンスファイルは以下の構造で形式情報を提供:

```markdown
### .pdb - Protein Data Bank
**説明:** 生物大分子の3D構造の標準形式
**典型的データ:** 原子座標、残基情報、二次構造
**用途:** タンパク質構造解析、分子可視化
**Pythonライブラリ:**
- `Biopython`: `Bio.PDB.PDBParser()`
- `MDAnalysis`: `MDAnalysis.Universe('file.pdb')`
**EDAアプローチ:**
- 構造検証（結合長、角度）
- B因子分布分析
- 欠損残基の検出
- Ramachandranプロット
```

### 効率的なリファレンス検索

```python
import re
from pathlib import Path

def find_format_info(extension: str, category: str) -> dict:
    """リファレンスファイルから形式情報を検索"""
    ref_path = Path(f"references/{category}_formats.md")
    content = ref_path.read_text()
    
    # 拡張子セクションを検索
    pattern = rf'### {extension}.*?(?=###|\Z)'
    match = re.search(pattern, content, re.DOTALL)
    
    if match:
        return parse_format_section(match.group())
    return None
```

## 使用例

### 例1: FASTQ配列データの分析

```bash
/skill:exploratory-data-analysis reads.fastq
```

**実行内容:**
1. 拡張子検出: `.fastq` → bioinformatics_genomics
2. リファレンス読み込み: FASTQ形式情報
3. 分析実行:
   ```python
   from Bio import SeqIO
   sequences = list(SeqIO.parse('reads.fastq', 'fastq'))
   
   # 統計計算
   read_count = len(sequences)
   lengths = [len(s) for s in sequences]
   gc_contents = [gc_content(s) for s in sequences]
   quality_scores = [mean_quality(s) for s in sequences]
   ```
4. レポート生成: `reads_eda_report.md`

**出力例:**
```markdown
# EDAレポート: reads.fastq

## 統計サマリー
- 総リード数: 1,000,000
- 平均長さ: 150 bp
- 長さ範囲: 100-300 bp
- 平均GC含量: 45.2%
- 平均品質スコア: 35.5

## 品質評価
- 低品質リード (<Q20): 2.3%
- N含量: 0.1%

## 推奨事項
1. Trimmomaticで品質フィルタリング
2. FastQCで詳細な品質確認
```

### 例2: 顕微鏡データの分析

```bash
/skill:exploratory-data-analysis cells.nd2
```

**実行内容:**
1. 拡張子検出: `.nd2` → microscopy_imaging (Nikon)
2. リファレンス読み込み: ND2形式情報
3. 分析実行:
   ```python
   from nd2reader import ND2Reader
   
   with ND2Reader('cells.nd2') as images:
       # メタデータ抽出
       dimensions = images.sizes  # {'x': 1024, 'y': 1024, 'z': 25, 'c': 3}
       channels = images.metadata['channels']
       pixel_size = images.metadata['pixel_microns']
       
       # 強度統計
       for frame in images:
           stats = analyze_frame(frame)
   ```
4. レポート生成

### 例3: CSV データセットの分析

```bash
/skill:exploratory-data-analysis experiment.csv
```

**実行内容:**
1. 拡張子検出: `.csv` → general_scientific
2. 分析実行:
   ```python
   import pandas as pd
   import numpy as np
   
   df = pd.read_csv('experiment.csv')
   
   # 基本統計
   info = {
       'shape': df.shape,
       'dtypes': df.dtypes.to_dict(),
       'missing': df.isnull().sum().to_dict(),
       'describe': df.describe().to_dict()
   }
   
   # 相関分析
   correlations = df.corr()
   
   # 外れ値検出
   outliers = detect_outliers(df)
   ```

### 例4: HDF5階層データの分析

```bash
/skill:exploratory-data-analysis simulation.h5
```

**実行内容:**
1. 拡張子検出: `.h5` → general_scientific
2. 構造探索:
   ```python
   import h5py
   
   def explore_hdf5(path):
       structure = {}
       with h5py.File(path, 'r') as f:
           def visitor(name, obj):
               if isinstance(obj, h5py.Dataset):
                   structure[name] = {
                       'shape': obj.shape,
                       'dtype': str(obj.dtype),
                       'attrs': dict(obj.attrs)
                   }
           f.visititems(visitor)
       return structure
   ```

## トラブルシューティング

### よくある問題と解決策

| 問題 | 原因 | 解決策 |
|------|------|--------|
| `ImportError: No module named 'Bio'` | Biopython未インストール | `uv pip install biopython` |
| `ImportError: No module named 'tifffile'` | 画像ライブラリ未インストール | `uv pip install tifffile nd2reader` |
| `ImportError: No module named 'pymzml'` | 質量分析ライブラリ未インストール | `uv pip install pymzml pyteomics` |
| メモリエラー | ファイルが大きすぎる | サンプリングまたはチャンク処理を使用 |
| 不明な拡張子 | リファレンスにない形式 | ユーザーに形式を確認、一般的な分析を試行 |
| 読み込みエラー | 破損または非標準形式 | ファイル整合性を確認、別のライブラリを試行 |

### カテゴリ別必要ライブラリ

| カテゴリ | 必須ライブラリ | オプション |
|----------|----------------|------------|
| バイオインフォマティクス | `biopython`, `pysam` | `pyBigWig`, `pybedtools` |
| 化学 | `rdkit` | `mdanalysis`, `cclib`, `openbabel` |
| 顕微鏡 | `tifffile`, `scikit-image` | `nd2reader`, `aicsimageio`, `pydicom` |
| 分光法 | `nmrglue` | `pymzml`, `pyteomics`, `matchms` |
| 一般 | `pandas`, `numpy`, `h5py` | `zarr`, `openpyxl`, `tables` |

### 大きなファイルの処理

```python
# サンプリング戦略
import pandas as pd

# CSV: チャンク読み込み
for chunk in pd.read_csv('large.csv', chunksize=10000):
    process(chunk)

# FASTQ: 最初のNレコードのみ
from Bio import SeqIO
for i, record in enumerate(SeqIO.parse('large.fastq', 'fastq')):
    if i >= 100000:
        break
    process(record)

# HDF5: メモリマップ
import h5py
with h5py.File('large.h5', 'r') as f:
    dataset = f['data']  # 遅延読み込み
    sample = dataset[:1000]  # 必要な部分のみ
```

## ベストプラクティス

### 分析の実行

1. **大きなファイルはサンプリング:** 数百万レコードの場合、代表的なサンプルで分析
2. **メタデータを検証:** 記載された次元と実際のデータを照合
3. **品質スコアを記録:** 再現性のために分析パラメータを保存
4. **段階的に分析:** 基本統計 → 分布 → 相関 → 外れ値の順で

### レポート作成

1. **具体的に:** ファイルタイプに基づく具体的な推奨
2. **実行可能に:** 次のステップを明確に
3. **コード例を含める:** データの読み込み方法を示す
4. **問題を明示:** 検出された問題と解決策を提示

### 品質管理

1. **形式コンプライアンス:** 標準への準拠をチェック
2. **メタデータ一貫性:** 関連フィールド間の整合性
3. **完全性:** 期待されるデータの存在確認
4. **外れ値:** 異常値の検出と文書化

## 高度な使用方法

### 複数ファイル分析

```bash
# ディレクトリ内の全ファイルを分析
for f in data/*.fastq; do
    python scripts/eda_analyzer.py "$f" "reports/$(basename $f)_report.md"
done

# 比較レポートを生成
python scripts/compare_reports.py reports/
```

### カスタム分析パイプライン

```python
from eda_analyzer import EDAnalyzer

# カスタム設定
analyzer = EDAnalyzer(
    sample_size=10000,
    quality_threshold=20,
    output_format='markdown'
)

# 分析実行
result = analyzer.analyze('data.h5')
result.save('report.md')
```

### 品質管理ワークフロー

```
1. EDA実行 → レポート生成
2. 品質指標の評価
3. フィルタリング/クリーニング
4. 再分析 → 品質改善確認
```

## 参考資料

### リファレンスファイル

| ファイル | 説明 | 形式数 |
|----------|------|--------|
| [chemistry_molecular_formats.md](references/chemistry_molecular_formats.md) | 化学・分子ファイル形式 | 60+ |
| [bioinformatics_genomics_formats.md](references/bioinformatics_genomics_formats.md) | バイオインフォマティクス・ゲノミクス | 50+ |
| [microscopy_imaging_formats.md](references/microscopy_imaging_formats.md) | 顕微鏡・イメージング | 45+ |
| [spectroscopy_analytical_formats.md](references/spectroscopy_analytical_formats.md) | 分光法・分析化学 | 35+ |
| [proteomics_metabolomics_formats.md](references/proteomics_metabolomics_formats.md) | プロテオミクス・メタボロミクス | 30+ |
| [general_scientific_formats.md](references/general_scientific_formats.md) | 一般科学データ | 30+ |

### アセット

| ファイル | 説明 |
|----------|------|
| [report_template.md](assets/report_template.md) | EDAレポート用マークダウンテンプレート |

### スクリプト

| ファイル | 説明 |
|----------|------|
| [eda_analyzer.py](scripts/eda_analyzer.py) | 包括的分析スクリプト（直接実行/インポート可能） |

## 関連リソース

- [K-Dense AI Claude Scientific Skills](https://github.com/K-Dense-AI/claude-scientific-skills) - 元の実装
- [Agent Skills Specification](https://agentskills.io/specification) - スキル標準仕様
- [Biopython Documentation](https://biopython.org/wiki/Documentation) - バイオインフォマティクス
- [RDKit Documentation](https://www.rdkit.org/docs/) - ケモインフォマティクス
- [PyMzML Documentation](http://pymzml.github.io/) - 質量分析データ

---

*このスキルは6カテゴリで200以上の科学ファイル形式をサポートします。*
*参考実装: [K-Dense AI Claude Scientific Skills](https://github.com/K-Dense-AI/claude-scientific-skills)*
