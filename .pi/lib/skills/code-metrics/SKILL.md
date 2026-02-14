---
name: code-metrics
description: コードメトリクス分析スキル。サイクロマティック複雑度、結合度、コードカバレッジ、認知的複雑度を測定。コード品質の定量的評価と改善点の特定に使用。
---

# Code Metrics

コード品質を定量的に評価するためのメトリクス分析スキル。複雑度、結合度、テストカバレッジなどの指標を測定し、改善優先度を特定する。

## サイクロマティック複雑度

### 概念

- **1-10**: シンプル（低リスク）
- **11-20**: 中程度（中リスク）
- **21-50**: 複雑（高リスク）
- **50+**: テスト不可能（リファクタリング必須）

### 測定ツール

#### JavaScript/TypeScript

```bash
# eslint複雑度ルール
npx eslint --rule 'complexity: ["error", 10]' src/

# 詳細分析
npx eslint --rule 'complexity: ["warn", 5]' src/ -f json | jq '.[] | .messages[] | select(.ruleId == "complexity")'
```

#### Python

```bash
# radonで複雑度測定
pip install radon
radon cc src/ -a

# McCabe複雑度
radon cc src/ -mc
```

#### Java

```bash
# PMD
pmd -d src/ -R category/design.xml/CyclomaticComplexity -f text
```

## 認知的複雑度（Cognitive Complexity）

人間がコードを理解する難易度を測定。ネスト、論理演算子の連続などが加算される。

```bash
# SonarQube/SonarLint
# ESLint cognitiv complexity plugin
npm install eslint-plugin-cognitive-complexity --save-dev
```

```json
// .eslintrc
{
  "plugins": ["cognitive-complexity"],
  "rules": {
    "cognitive-complexity": ["error", 15]
  }
}
```

## 結合度分析

### ファンイン・ファンアウト

- **ファンイン**: 他から参照される数（高い=安定）
- **ファンアウト**: 他を参照する数（高い=不安定）

### 測定方法

```bash
# 依存関係数をカウント
rg "^import|^require" -c src/

# 被参照数をカウント
for file in src/**/*.ts; do
  name=$(basename "$file" .ts)
  count=$(rg "$name" src/ -l | wc -l)
  echo "$name: $count"
done
```

### 凝集度

```bash
# クラス内のメソッド呼び出し関係を分析
# LCOM (Lack of Cohesion of Methods) が高い=凝集度が低い
```

## コードカバレッジ

### JavaScript/TypeScript

```bash
# Jest
npm test -- --coverage

# Istanbul/nyc
nyc npm test

# カバレッジレポート
npm test -- --coverage --coverageReporters=text --coverageReporters=html
```

### Python

```bash
# coverage.py
pip install coverage
coverage run -m pytest
coverage report
coverage html

# pytest-cov
pytest --cov=src --cov-report=html
```

### カバレッジ基準

- **80%+**: 良好
- **70-80%**: 改善余地あり
- **70%未満**: 優先的にテスト追加

## コード重複（DRY原則）

```bash
# CPD (Copy-Paste Detector)
pmd cpd --directory src/ --minimum-tokens 100

#jscpd
npx jscpd src/

# 結果の解釈
# 5%未満: 良好
# 5-10%: 注意
# 10%+: 要リファクタリング
```

## メンテナビリティインデックス

0-100のスコアで保守性を評価。複雑度、コード行数、Halsteadボリュームを組み合わせ。

```bash
# radon（Python）
radon mi src/ -s

# スコア基準
# 20-100: 良好
# 10-19: 中程度
# 0-9: 低い
```

## 技術的負債

### SQALE（Software Quality Assessment based on Lifecycle Expectations）

```bash
# SonarQubeでの測定
# 技術的負債 = 修正にかかる推定時間
```

### 負債比率

```
負債比率 = 技術的負債 / コード規模
```

- **0-5%**: 優秀
- **5-10%**: 許容範囲
- **10%+**: 優先対応必要

## メトリクス統合レポート

```bash
#!/bin/bash
echo "=== Code Metrics Report ==="
echo ""
echo "=== Cyclomatic Complexity ==="
radon cc src/ -s -a
echo ""
echo "=== Maintainability Index ==="
radon mi src/ -s
echo ""
echo "=== Test Coverage ==="
coverage report
echo ""
echo "=== Code Duplication ==="
npx jscpd src/ --reporters consoleSummary
```

## 改善優先順位の決定

1. **複雑度が高く、カバレッジが低い** → 最優先でリファクタリング+テスト追加
2. **結合度が高い** → インターフェース導入、DI検討
3. **重複コード** → 共通関数/モジュールに抽出
4. **低凝集度** → クラス分割検討
