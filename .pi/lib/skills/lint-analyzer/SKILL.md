---
name: lint-analyzer
description: Lint結果解析スキル。ESLint/Pylint/Rubocop/golint等の結果を解析し、修正提案を生成。コードスタイル違反、潜在的バグ、ベストプラクティス違反を特定。
---

# Lint Analyzer

各種Lintツールの結果を解析し、修正提案を生成するスキル。複数言語のLintツールに対応。

## JavaScript/TypeScript (ESLint)

### 実行方法

```bash
# 基本実行
npx eslint src/

# 自動修正
npx eslint src/ --fix

# JSON形式で出力（解析用）
npx eslint src/ -f json

# 設定ファイル指定
npx eslint src/ -c .eslintrc.custom.json
```

### ルールカテゴリ

| カテゴリ | 内容 | 例 |
|----------|------|-----|
| Possible Errors | 構文エラー | no-console, no-debugger |
| Best Practices | ベストプラクティス | eqeqeq, no-var |
| Variables | 変数関連 | no-unused-vars, no-undef |
| Stylistic Issues | スタイル | semi, quotes |
| ES6 | ES6関連 | prefer-const, arrow-spacing |

### 主要ルールと修正

```javascript
// no-unused-vars: 使用されていない変数
// 修正前
const unusedVariable = 1;
// 修正後: 削除 または _unusedVariable として明示

// eqeqeq: 厳密等価演算子
// 修正前
if (a == b) {}
// 修正後
if (a === b) {}

// prefer-const: 再代入しない変数
// 修正前
let x = 1;
// 修正後
const x = 1;
```

### ESLintレポート解析

```bash
# エラー/ワーニング数
npx eslint src/ -f json | jq '[.[] | .messages | length] | add'

# ルール別集計
npx eslint src/ -f json | jq '[.[] | .messages[].ruleId] | group_by(.) | map({rule: .[0], count: length}) | sort_by(-.count)'

# ファイル別エラー数
npx eslint src/ -f json | jq '.[] | {file: .filePath, errors: (.messages | length)} | select(.errors > 0)'
```

## Python (Pylint/Flake8)

### Flake8

```bash
# 基本実行
flake8 src/

# 設定ファイル
flake8 src/ --config=.flake8

# 除外ルール
flake8 src/ --ignore=E501,W503

# 最大行数指定
flake8 src/ --max-line-length=100
```

### Pylint

```bash
# 基本実行
pylint src/

# スコア表示
pylint src/ --output-format=text

# JSON出力
pylint src/ --output-format=json
```

### Pylintメッセージタイプ

| タイプ | 意味 | 例 |
|--------|------|-----|
| C | Convention | C0114: missing-module-docstring |
| R | Refactor | R0913: too-many-arguments |
| W | Warning | W0611: unused-import |
| E | Error | E1101: no-member |
| F | Fatal | F0010: parse-error |

### レポート解析

```bash
# カテゴリ別集計
pylint src/ --output-format=json | jq '[.[] | .type] | group_by(.) | map({type: .[0], count: length})'

# ファイル別スコア
pylint src/ --output-format=parseable | grep "rated at"
```

## Ruby (RuboCop)

```bash
# 基本実行
rubocop

# 自動修正
rubocop -a

# 安全な自動修正のみ
rubocop --safe-auto-correct

# JSON出力
rubocop --format json
```

### Copカテゴリ

- **Style**: コードスタイル
- **Layout**: フォーマット
- **Lint**: 潜在的バグ
- **Metrics**: 複雑度
- **Naming**: 命名規則

## Go (golangci-lint)

```bash
# インストール
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# 実行
golangci-lint run

# 特定リンター指定
golangci-lint run --enable=errcheck,gosimple,govet

# JSON出力
golangci-lint run --out-format=json
```

## 統合レポート生成

```bash
#!/bin/bash
echo "=== Lint Analysis Report ==="
echo ""
echo "=== ESLint ==="
npx eslint src/ -f stylish
echo ""
echo "=== Summary ==="
npx eslint src/ -f json | jq '{
  files: length,
  errors: [.[] | .errorCount] | add,
  warnings: [.[] | .warningCount] | add
}'
```

## CI統合例

```yaml
# GitHub Actions
- name: Run ESLint
  run: npx eslint src/ --max-warnings 0

- name: Run Pylint
  run: pylint src/ --fail-under=8.0
```

## 修正優先順位

1. **Error/Fatal**: 即時修正（ビルド/実行不可）
2. **Warning**: 次回コミットまでに修正
3. **Convention/Style**: 時間がある時に修正

## よくあるLint違反と対応

| 違反 | 対応方法 |
|------|----------|
| unused-import | 未使用importを削除 |
| no-undef | 変数を定義またはimport |
| trailing-whitespace | 行末空白を削除 |
| missing-docstring | ドキュメント文字列を追加 |
| too-many-arguments | 引数をオブジェクト/辞書にまとめる |
