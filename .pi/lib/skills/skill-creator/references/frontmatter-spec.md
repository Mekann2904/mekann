---
reference-type: specification
skill: skill-creator
version: "1.0.0"
---

# Frontmatter完全仕様

SKILL.mdのYAML frontmatterに関する完全な仕様ドキュメント。Agent Skills標準に基づく。

## 概要

FrontmatterはSKILL.mdの先頭に配置するYAMLブロック。スキルのメタデータを定義する。

```yaml
---
name: skill-name
description: スキルの説明
---
```

## 必須フィールド

### name

スキルの一意識別子。

| 属性 | 値 |
|------|-----|
| 型 | string |
| 必須 | Yes |
| 最大長 | 64文字 |
| パターン | `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` |

**ルール:**
- 小文字a-z、数字0-9、ハイフン(-)のみ使用可能
- 先頭と末尾にハイフン不可
- 連続するハイフン不可
- 親ディレクトリ名と一致する必要がある

**有効な例:**
```yaml
name: pdf-processing
name: data-validation
name: api-client
name: code-review
```

**無効な例:**
```yaml
name: PDF-Processing    # 大文字を含む
name: -pdf              # 先頭がハイフン
name: pdf-              # 末尾がハイフン
name: pdf--processing   # 連続ハイフン
name: pdf_processing    # アンダースコア使用
```

### description

スキルの説明。いつ使用するかを含める。

| 属性 | 値 |
|------|-----|
| 型 | string |
| 必須 | Yes |
| 最大長 | 1024文字 |

**重要:** descriptionが欠けているスキルはロードされない。

**良い例:**
```yaml
description: PDFファイルからテキストとテーブルを抽出。PDFフォームへの入力、複数PDFの結合に対応。PDF文書を扱う場合に使用。
```

**悪い例:**
```yaml
description: PDF用ツール。
```

## 任意フィールド

### license

スキルのライセンス。

| 属性 | 値 |
|------|-----|
| 型 | string |
| 必須 | No |

**一般的な値:**
- `MIT`
- `Apache-2.0`
- `GPL-3.0`
- `BSD-3-Clause`
- `Proprietary`

**例:**
```yaml
license: MIT
```

### compatibility

環境要件。

| 属性 | 値 |
|------|-----|
| 型 | string |
| 必須 | No |
| 最大長 | 500文字 |

**例:**
```yaml
compatibility: "Node.js >= 18, Python >= 3.10"
```

### metadata

任意のキーバリューペア。

| 属性 | 値 |
|------|-----|
| 型 | object |
| 必須 | No |

**推奨キー:**
| キー | 型 | 説明 |
|------|-----|------|
| skill-version | string | スキルのバージョン |
| created | string | 作成日 (ISO 8601) |
| author | string | 作成者名 |
| category | string | カテゴリ分類 |
| tags | array | タグ一覧 |

**例:**
```yaml
metadata:
  skill-version: "1.0.0"
  created: "2026-02-14"
  author: "Development Team"
  category: data-processing
  tags:
    - csv
    - validation
    - schema
```

### allowed-tools

事前承認されたツールリスト（実験的）。

| 属性 | 値 |
|------|-----|
| 型 | string (スペース区切り) |
| 必須 | No |

**例:**
```yaml
allowed-tools: read write bash
```

### disable-model-invocation

システムプロンプトからの非表示。

| 属性 | 値 |
|------|-----|
| 型 | boolean |
| 必須 | No |
| デフォルト | false |

`true`の場合、スキルは`/skill:name`でのみ使用可能。

**例:**
```yaml
disable-model-invocation: true
```

## 完全な例

### 最小構成

```yaml
---
name: hello-world
description: 挨拶を生成するシンプルなスキル。
---
```

### 標準構成

```yaml
---
name: api-client
description: REST API呼び出しを支援。エンドポイント設計、リクエスト構築、レスポンス解析をガイド。外部APIとの連携が必要な場合に使用。
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-14"
  author: "API Team"
---
```

### 完全構成

```yaml
---
name: data-pipeline
description: データパイプラインの構築と実行を支援。ETL処理、データ変換、バリデーション、スケジューリングを含む。大量データ処理や定期的なデータ連携が必要な場合に使用。
license: Apache-2.0
compatibility: "Python >= 3.10, PostgreSQL >= 14"
metadata:
  skill-version: "2.1.0"
  created: "2025-10-01"
  updated: "2026-02-14"
  author: "Data Engineering Team"
  category: data-processing
  tags:
    - etl
    - pipeline
    - data-transform
    - scheduling
allowed-tools: read write bash
---
```

## 検証ルール

Piは起動時に以下を検証:

| チェック項目 | 重大度 | 動作 |
|--------------|--------|------|
| description欠損 | Error | スキルをロードしない |
| name不一致 | Warning | ロードするが警告表示 |
| name > 64文字 | Warning | ロードするが警告表示 |
| 無効な文字 | Warning | ロードするが警告表示 |
| 先頭/末尾ハイフン | Warning | ロードするが警告表示 |
| 連続ハイフン | Warning | ロードするが警告表示 |
| description > 1024文字 | Warning | ロードするが警告表示 |
| 不明なフィールド | Ignore | 無視してロード |

## YAML構文注意点

### 文字列の引用符

```yaml
# 引用符なし（推奨）
name: my-skill

# 単一引用符（特殊文字がある場合）
description: 'JSON, XML & CSV files'

# 二重引用符（エスケープが必要な場合）
description: "Supports \"quoted\" strings"
```

### 複数行の説明

```yaml
# パイプ記法（改行を保持）
description: |
  データファイルをスキーマに対して検証。
  CSV、JSON、YAML形式に対応。
  エラーを行番号付きで報告。

# 矢印記法（改行をスペースに変換）
description: >
  データファイルをスキーマに対して検証。
  CSV、JSON、YAML形式に対応。
```

### メタデータのネスト

```yaml
metadata:
  skill-version: "1.0.0"
  dependencies:
    python: ">=3.10"
    node: ">=18"
  contact:
    name: "Support Team"
    email: "support@example.com"
```

## トラブルシューティング

### よくあるエラー

| エラー | 原因 | 解決策 |
|--------|------|--------|
| `description is required` | description欠損 | descriptionを追加 |
| `name must match directory` | nameとディレクトリ名不一致 | nameまたはディレクトリ名を修正 |
| `invalid YAML` | 構文エラー | YAML構文を確認 |
| `unknown field` | 未定義フィールド | 無視される（問題なし） |

### YAML構文チェック

```bash
# PythonでYAML構文を確認
python3 -c "import yaml; yaml.safe_load(open('SKILL.md').read().split('---')[1])"
```

---

## 配置場所

このプロジェクトでのスキル配置ルール:

| ディレクトリ | 用途 | Piロード |
|--------------|------|----------|
| `.pi/lib/skills/` | **メインのスキル置き場** | settings.jsonで明示指定 |
| `.pi/skills/` | 自動ロード回避用 | 自動ロード（通常は空） |

**推奨:** 新規スキルは `.pi/lib/skills/` に配置。

```bash
# 新規スキル作成先
.pi/lib/skills/my-skill/SKILL.md

# .pi/lib/skills/ を有効にする設定 (.pi/settings.json)
{
  "skills": [".pi/lib/skills"]
}
```

---

*このリファレンスはAgent Skills標準に基づいています。*
