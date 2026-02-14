---
name: dependency-mapper
description: 依存関係可視化スキル。import/require関係を分析し、モジュール間の依存グラフを生成。影響範囲特定、循環依存検出、アーキテクチャ理解に使用。
---

# Dependency Mapper

コードベースの依存関係を可視化・分析するスキル。モジュール間の関係を理解し、リファクタリングの影響範囲を特定する。

## 基本的な依存関係抽出

### JavaScript/TypeScript

```bash
# import文の抽出
rg "^import.*from ['\"]" -o src/ | sort | uniq -c | sort -rn

# require文の抽出
rg "require\(['\"][^'\"]+['\"]\)" -o src/ | sort | uniq -c | sort -rn

# 特定モジュールの被参照
rg "from ['\"]lodash['\"]" src/ -l
```

### Python

```bash
# import文の抽出
rg "^import |^from " src/ | sort | uniq -c | sort -rn

# 特定パッケージの使用箇所
rg "import pandas|from pandas" src/ -l
```

## 依存関係グラフ生成

### madge（JavaScript/TypeScript）

```bash
# インストール
npm install -g madge

# 依存関係ツリー
madge src/

# 循環依存検出
madge --circular src/

# グラフ画像生成（graphvizが必要）
madge --image graph.svg src/

# JSON出力
madge --json src/
```

### dep-tree（Python）

```bash
# pipdeptree
pip install pipdeptree
pipdeptree

# JSON出力
pipdeptree --json-tree
```

## 循環依存検出

### 検出方法

```bash
# madgeで循環依存
madge --circular src/

# 出力例
# ✖ Found 2 circular dependencies!
#
# 1) src/a.ts > src/b.ts > src/c.ts > src/a.ts
# 2) src/x.ts > src/y.ts > src/x.ts
```

### 循環依存の解決

1. **依存注入**: コンストラクタ/関数引数で渡す
2. **インターフェース分離**: 共通インターフェースを抽出
3. **モジュール分割**: 循環部分を別モジュールに
4. **遅延インポート**: 動的importを使用

```typescript
// 循環依存の解決例
// Before: A imports B, B imports A

// After: 共通インターフェースを抽出
// types.ts
export interface ICommon { method(): void; }

// a.ts
import { ICommon } from './types';
export class A implements ICommon { ... }

// b.ts
import { ICommon } from './types';
export class B {
  constructor(private dep: ICommon) {}
}
```

## 影響範囲分析

### 特定ファイルの影響範囲

```bash
# このファイルを参照しているファイル
rg "from ['\"].*utils['\"]|require\(['\"].*utils['\"]" src/ -l

# より詳細なパターン
rg "import.*from.*['\"](\.\./)*utils['\"]" src/ -l
```

### 影響範囲スクリプト

```bash
#!/bin/bash
# 特定モジュールの影響範囲を調査
MODULE=$1
echo "=== Files depending on $MODULE ==="
rg "import.*$MODULE|require.*$MODULE" src/ -l | sort

echo ""
echo "=== Count by directory ==="
rg "import.*$MODULE|require.*$MODULE" src/ -l | xargs -I{} dirname {} | sort | uniq -c
```

## アーキテクチャ可視化

### レイヤー依存の確認

```bash
# componentsから直接apiを参照していないか
rg "from ['\"].*api['\"]" src/components/ -l

# utilsがビジネスロジックを参照していないか
rg "from ['\"].*domain['\"]" src/utils/ -l
```

### 依存方向ルールの検証

```bash
#!/bin/bash
# レイヤー違反チェック
# 許可される依存: views -> components -> services -> api
# 違反を検出

echo "=== Checking layer violations ==="

# apiが上位レイヤーを参照していないか
echo "API layer referencing upper layers:"
rg "from ['\"].*(components|views|services)['\"]" src/api/ -l

# servicesがviewsを参照していないか
echo "Services layer referencing views:"
rg "from ['\"].*views['\"]" src/services/ -l
```

## 依存関係メトリクス

### ファンアウト（他を参照する数）

```bash
# ファイルあたりのimport数
for f in $(find src -name "*.ts"); do
  imports=$(grep -c "^import" "$f" 2>/dev/null || echo 0)
  if [ "$imports" -gt 10 ]; then
    echo "$imports imports: $f"
  fi
done | sort -rn
```

### ファンイン（他から参照される数）

```bash
# モジュール別の被参照数
for mod in $(find src -name "*.ts" -exec basename {} .ts \;); do
  refs=$(rg "import.*$mod|from.*$mod" src/ -l | wc -l)
  if [ "$refs" -gt 5 ]; then
    echo "$refs refs: $mod"
  fi
done | sort -rn
```

## 可視化ツール

### Graphviz/DOT形式

```bash
# DOT形式出力
madge --dot src/ > deps.dot

# SVG変換
dot -Tsvg deps.dot -o deps.svg

# PNG変換
dot -Tpng deps.dot -o deps.png
```

### Mermaid形式

```bash
# 手動でMermaidダイアグラム生成
# 依存関係を収集
rg "^import.*from ['\"]" src/ -o | \
  sed "s/import.*from ['\"]//;s/['\"]$//" | \
  sort | uniq
```

## CI統合

```yaml
# 循環依存チェック
- name: Check circular dependencies
  run: madge --circular src/
```

## 改善アクション

| 問題 | 対処法 |
|------|--------|
| 循環依存 | インターフェース抽出、依存注入 |
| 高ファンアウト | モジュール分割、Facade導入 |
| レイヤー違反 | 依存方向の修正、レイヤー分離 |
| 未使用依存 | importの削除 |
