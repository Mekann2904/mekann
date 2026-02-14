---
name: code-search
description: 高速コード検索スキル。ripgrep/grepによるパターンマッチング、ファイルタイプ別検索、正規表現検索を実行。コードベース内の関数、クラス、変数の定義・使用箇所を特定する際に使用。
---

# Code Search

コードベース全体を高速に検索するためのスキル。ripgrep (rg) または grep を使用して、パターンマッチング、正規表現検索、ファイルタイプ別検索を実行する。

## 基本的な使用方法

### パターン検索

```bash
# 基本的なパターン検索
rg "pattern" .

# 大文字小文字を無視
rg -i "pattern" .

# 正規表現を使用
rg -E "func\s+\w+\(" .
```

### ファイルタイプ指定

```bash
# TypeScriptファイルのみ
rg "pattern" -t ts

# Pythonファイルのみ
rg "pattern" -t py

# 除外するファイルタイプ
rg "pattern" -T json -T md
```

### コンテキスト表示

```bash
# マッチ前後3行を表示
rg -C 3 "pattern" .

# マッチ後の行のみ
rg -A 5 "pattern" .

# マッチ前の行のみ
rg -B 2 "pattern" .
```

## よく使用する検索パターン

### 関数定義の検索

```bash
# JavaScript/TypeScript
rg "function\s+\w+" -t js -t ts
rg "const\s+\w+\s*=" -t js -t ts

# Python
rg "def\s+\w+" -t py

# Go
rg "func\s+\w+" -t go
```

### クラス定義の検索

```bash
# JavaScript/TypeScript
rg "class\s+\w+" -t js -t ts

# Python
rg "class\s+\w+" -t py
```

### インポート/依存関係の検索

```bash
# ES Modules
rg "import.*from" -t js -t ts

# CommonJS
rg "require\(" -t js

# Python
rg "import\s+" -t py
rg "from\s+\w+\s+import" -t py
```

### TODO/FIXMEの検出

```bash
rg "TODO|FIXME|HACK|XXX" -i
```

## 高度な検索

### 除外パターン

```bash
# node_modulesを除外
rg "pattern" --glob '!node_modules/*'

# 複数除外
rg "pattern" --glob '!node_modules/*' --glob '!dist/*' --glob '!.git/*'
```

### ファイル名のみ表示

```bash
rg -l "pattern" .
```

### 統計情報

```bash
rg --stats "pattern" .
```

## 参考リンク

- [ripgrep ドキュメント](https://github.com/BurntSushi/ripgrep)
