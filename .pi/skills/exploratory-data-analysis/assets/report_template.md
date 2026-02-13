---
template-type: asset
skill: exploratory-data-analysis
description: EDAレポート用のマークダウンテンプレート。分析結果を構造化されたレポート形式で出力するために使用。
variables:
  - FILENAME
  - TIMESTAMP
  - FILEPATH
  - FILE_SIZE_HUMAN
  - FILE_SIZE_BYTES
  - MODIFIED_DATE
  - EXTENSION
  - CATEGORY
  - FORMAT_DESCRIPTION
  - TYPICAL_DATA
  - USE_CASES
  - PYTHON_LIBRARIES
  - DATA_STRUCTURE_OVERVIEW
  - DIMENSIONS
  - DATA_TYPES
  - MISSING_VALUES
  - COVERAGE
  - NUMERICAL_STATS
  - CATEGORICAL_STATS
---

# 探索的データ分析レポート: {FILENAME}

**生成日時:** {TIMESTAMP}

---

## エグゼクティブサマリー

このレポートは `{FILENAME}` ファイルの包括的な探索的データ分析を提供します。分析には、ファイルタイプ識別、形式固有メタデータ抽出、データ品質評価、ダウンストリーム分析の推奨が含まれます。

---

## 基本情報

- **ファイル名:** `{FILENAME}`
- **フルパス:** `{FILEPATH}`
- **ファイルサイズ:** {FILE_SIZE_HUMAN} ({FILE_SIZE_BYTES} バイト)
- **最終更新日:** {MODIFIED_DATE}
- **拡張子:** `.{EXTENSION}`
- **形式カテゴリ:** {CATEGORY}

---

## ファイルタイプ詳細

### 形式の説明
{FORMAT_DESCRIPTION}

### 典型的なデータ内容
{TYPICAL_DATA}

### 一般的な用途
{USE_CASES}

### 読み込み用Pythonライブラリ
{PYTHON_LIBRARIES}

---

## データ構造分析

### 概要
{DATA_STRUCTURE_OVERVIEW}

### 次元
{DIMENSIONS}

### データ型
{DATA_TYPES}

---

## 品質評価

### 完全性
- **欠損値:** {MISSING_VALUES}
- **データカバレッジ:** {COVERAGE}

### 妥当性
- **範囲チェック:** {RANGE_CHECK}
- **形式準拠:** {FORMAT_COMPLIANCE}
- **一貫性:** {CONSISTENCY}

### 整合性
- **チェックサム/検証:** {VALIDATION}
- **ファイル破損チェック:** {CORRUPTION_CHECK}

---

## 統計サマリー

### 数値変数
{NUMERICAL_STATS}

### カテゴリ変数
{CATEGORICAL_STATS}

### 分布
{DISTRIBUTIONS}

---

## データ特性

### 時間プロパティ（該当する場合）
- **時間範囲:** {TIME_RANGE}
- **サンプリングレート:** {SAMPLING_RATE}
- **欠損時点:** {MISSING_TIMEPOINTS}

### 空間プロパティ（該当する場合）
- **次元:** {SPATIAL_DIMENSIONS}
- **解像度:** {SPATIAL_RESOLUTION}
- **座標系:** {COORDINATE_SYSTEM}

### 実験メタデータ（該当する場合）
- **機器:** {INSTRUMENT}
- **メソッド:** {METHOD}
- **サンプル情報:** {SAMPLE_INFO}

---

## 主な発見事項

1. **データ量:** {DATA_VOLUME_FINDING}
2. **データ品質:** {DATA_QUALITY_FINDING}
3. **注目すべきパターン:** {PATTERNS_FINDING}
4. **潜在的問題:** {ISSUES_FINDING}

---

## 可視化

### 分布プロット
{DISTRIBUTION_PLOTS}

### 相関分析
{CORRELATION_PLOTS}

### 時系列（該当する場合）
{TIMESERIES_PLOTS}

---

## 追加分析の推奨事項

### 即時アクション
1. {RECOMMENDATION_1}
2. {RECOMMENDATION_2}
3. {RECOMMENDATION_3}

### 前処理ステップ
- {PREPROCESSING_1}
- {PREPROCESSING_2}
- {PREPROCESSING_3}

### 分析アプローチ
{ANALYTICAL_APPROACHES}

### ツールとメソッド
- **推奨ソフトウェア:** {RECOMMENDED_SOFTWARE}
- **統計メソッド:** {STATISTICAL_METHODS}
- **可視化ツール:** {VIZ_TOOLS}

---

## データ処理ワークフロー

```
{WORKFLOW_DIAGRAM}
```

---

## 潜在的な課題

1. **課題:** {CHALLENGE_1}
   - **対策:** {MITIGATION_1}

2. **課題:** {CHALLENGE_2}
   - **対策:** {MITIGATION_2}

---

## 参考資料とリソース

### 形式仕様
- {FORMAT_SPEC_LINK}

### Pythonライブラリドキュメント
- {LIBRARY_DOCS}

### 関連分析例
- {EXAMPLE_LINKS}

---

## 付録

### 完全なファイルメタデータ
```json
{COMPLETE_METADATA}
```

### 分析パラメータ
```json
{ANALYSIS_PARAMETERS}
```

### ソフトウェアバージョン
- Python: {PYTHON_VERSION}
- 主要ライブラリ: {LIBRARY_VERSIONS}

---

*このレポートはexploratory-data-analysisスキルにより自動生成されました。*
*質問や問題がある場合は、スキルのドキュメントを参照してください。*
